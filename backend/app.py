import os
import json
import traceback
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import uvicorn
import sys
import asyncio
import httpx
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
sys.path.append("./apis")
from apis.deepseek import call_deepseek, call_deepseek_stream
from apis.tongyi import call_tongyi
from db import AsyncSessionLocal, Task, Config, init_db, User
from sqlalchemy.future import select
from sqlalchemy import desc
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv('JWT_SECRET', 'smartops_dev_secret')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7天

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

def create_access_token(data: dict, expires_delta: int = ACCESS_TOKEN_EXPIRE_MINUTES):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=expires_delta)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 结构化结果解析
STRUCT_KEYS = ['问题', '原因', '建议', '措施', '分析', '优化']
def parse_structured(result: str) -> dict:
    structured = {}
    for key in STRUCT_KEYS:
        idx = result.find(key)
        if idx != -1:
            structured[key] = result[idx:result.find('\n', idx)]
    return structured

def extract_suggestions(result: str) -> List[str]:
    suggestions = []
    lines = result.split('\n')
    for line in lines:
        line = line.strip()
        if line.startswith('建议') or line.startswith('推荐') or line.startswith('-'):
            suggestions.append(line)
    return suggestions[:5]

class ChatRequest(BaseModel):
    model: str  # "deepseek" or "tongyi"
    prompt: Optional[str] = None
    messages: Optional[list] = None
    context: Optional[dict] = None

async def call_with_timeout(model, messages, timeout=20):
    try:
        if model == "deepseek":
            return await asyncio.wait_for(call_deepseek(messages), timeout=timeout)
        elif model == "tongyi":
            return await asyncio.wait_for(call_tongyi(messages), timeout=timeout)
    except Exception as e:
        print(f"{model} API error:", e)
        traceback.print_exc()
        return None

def make_task_id():
    return f"task_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"

@app.on_event("startup")
async def on_startup():
    await init_db()

# 依赖注入获取Session
async def get_session():
    async with AsyncSessionLocal() as session:
        yield session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")

async def get_current_user(token: str = Depends(oauth2_scheme), session=Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        if username is None or user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

@app.post("/chat")
async def chat(req: ChatRequest, session=Depends(get_session), current_user: User = Depends(get_current_user)):
    print("收到 /chat 任务创建请求")
    messages = req.messages if req.messages is not None else []
    if not messages and req.prompt:
        messages = [{"role": "user", "content": req.prompt}]
    if req.context and req.context.get('history'):
        for ctx in req.context['history']:
            messages.append({"role": "user", "content": ctx})
    main_model = req.model
    backup_model = "tongyi" if main_model == "deepseek" else "deepseek"
    task_id = make_task_id()
    prompt = req.prompt or (messages[-1]['content'] if messages else '')
    now = datetime.now()
    db_task = Task(
        task_id=task_id,
        status="running",
        model=main_model,
        prompt=prompt,
        messages=messages,
        timestamp=now,
        user_id=current_user.id
    )
    session.add(db_task)
    await session.commit()
    print(f"/chat 任务已写入数据库: {db_task.task_id}")
    reply = await call_with_timeout(main_model, messages, timeout=20)
    if reply is None:
        reply = await call_with_timeout(backup_model, messages, timeout=15)
        if reply is None:
            db_task.status = "failed"
            db_task.result = "两个API接口均无响应，请稍后重试"
            await session.commit()
            raise HTTPException(status_code=500, detail=db_task.result)
        else:
            db_task.status = "completed"
            db_task.result = f"主通道超时，已切换到{backup_model}：\n" + reply
    else:
        db_task.status = "completed"
        db_task.result = reply
    db_task.suggestions = extract_suggestions(db_task.result)
    db_task.structured = parse_structured(db_task.result)
    await session.commit()
    return {"reply": db_task.result, "task_id": db_task.task_id, "status": db_task.status, "suggestions": db_task.suggestions, **(db_task.structured or {})}

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    messages = req.messages if req.messages is not None else []
    if not messages and req.prompt:
        messages = [{"role": "user", "content": req.prompt}]
    if req.model != "deepseek":
        raise HTTPException(status_code=400, detail="当前仅支持DeepSeek流式对话")
    async def event_generator():
        async for chunk in call_deepseek_stream(messages):
            yield chunk
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/analyze")
async def analyze(file: UploadFile = File(...), model: str = Form("deepseek"), session=Depends(get_session), current_user: User = Depends(get_current_user)):
    print("收到 /analyze 文件分析任务请求")
    try:
        content = (await file.read()).decode("utf-8", errors="ignore")
        prompt = f"请帮我分析以下日志或配置文件内容，给出关键信息、异常、优化建议等：\n\n{content[:4000]}"
        messages = [{"role": "user", "content": prompt}]
        task_id = make_task_id()
        now = datetime.now()
        db_task = Task(
            task_id=task_id,
            status="running",
            model=model,
            prompt=prompt,
            messages=messages,
            timestamp=now,
            user_id=current_user.id
        )
        session.add(db_task)
        await session.commit()
        print(f"/analyze 任务已写入数据库: {db_task.task_id}")
        if model == "deepseek":
            reply = await call_deepseek(messages)
        else:
            reply = await call_tongyi(messages)
        db_task.status = "completed"
        db_task.result = reply
        db_task.suggestions = extract_suggestions(reply)
        db_task.structured = parse_structured(reply)
        await session.commit()
        return {"result": reply, "task_id": task_id, "status": db_task.status, "suggestions": db_task.suggestions, **(db_task.structured or {})}
    except Exception as e:
        print("Analyze error:", e)
        db_task.status = "failed"
        db_task.result = "文件分析失败: " + str(e)
        await session.commit()
        return {"result": db_task.result, "task_id": task_id, "status": db_task.status}

@app.get("/api/history")
async def api_history(session=Depends(get_session), current_user: User = Depends(get_current_user)):
    result = await session.execute(select(Task).where(Task.user_id == current_user.id).order_by(desc(Task.timestamp)).limit(20))
    tasks = result.scalars().all()
    return [
        {
            "task_id": t.task_id,
            "status": t.status,
            "model": t.model,
            "prompt": t.prompt,
            "messages": t.messages,
            "result": t.result,
            "suggestions": t.suggestions,
            "structured": t.structured,
            "timestamp": t.timestamp.isoformat() if t.timestamp else None
        }
        for t in tasks
    ]

@app.get("/api/status")
async def api_status(task_id: Optional[str] = None, session=Depends(get_session), current_user: User = Depends(get_current_user)):
    if task_id:
        result = await session.execute(select(Task).where(Task.task_id == task_id).where(Task.user_id == current_user.id))
        t = result.scalar_one_or_none()
        if t:
            return {
                "task_id": t.task_id,
                "status": t.status,
                "model": t.model,
                "prompt": t.prompt,
                "messages": t.messages,
                "result": t.result,
                "suggestions": t.suggestions,
                "structured": t.structured,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None
            }
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"status": "ok"}

@app.post("/api/config")
async def update_config(model: str = Body(...), api_key: str = Body(...), session=Depends(get_session), current_user: User = Depends(get_current_user)):
    key = f"{model}_api_key"
    cfg = await session.get(Config, {"key": key, "user_id": current_user.id})
    if cfg:
        cfg.value = api_key
    else:
        cfg = Config(key=key, user_id=current_user.id, value=api_key)
        session.add(cfg)
    await session.commit()
    return {"msg": "配置已更新"}

@app.get("/api/config")
async def get_config(model: str, session=Depends(get_session), current_user: User = Depends(get_current_user)):
    key = f"{model}_api_key"
    cfg = await session.get(Config, {"key": key, "user_id": current_user.id})
    if cfg:
        return {"key": key, "value": cfg.value}
    return {"key": key, "value": None}

@app.post("/api/register", response_model=Token)
async def register(user: UserCreate, session=Depends(get_session)):
    hashed_password = get_password_hash(user.password)
    db_user = User(username=user.username, password_hash=hashed_password)
    session.add(db_user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=400, detail="用户名已存在")
    token = create_access_token({"sub": db_user.username, "user_id": db_user.id})
    return {"access_token": token, "token_type": "bearer"}

@app.post("/api/login", response_model=Token)
async def login(user: UserLogin, session=Depends(get_session)):
    result = await session.execute(select(User).where(User.username == user.username))
    db_user = result.scalar_one_or_none()
    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token({"sub": db_user.username, "user_id": db_user.id})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/")
def read_root():
    return {"message": "SmartOps-AI backend is running."}

# TODO: 按需引入 deepseek 和 tongyi 路由 