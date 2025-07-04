import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession  # noqa: F401
from sqlalchemy.orm import sessionmaker, declarative_base  # noqa: F401
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Boolean  # noqa: F401
from datetime import datetime

DB_URL = os.getenv('DB_URL', 'sqlite+aiosqlite:///./smartops.db')
engine = create_async_engine(DB_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, index=True)
    status = Column(String(32), index=True)
    model = Column(String(32), index=True)
    provider = Column(String(32), index=True)
    prompt = Column(Text)
    messages = Column(JSON)
    result = Column(Text)
    suggestions = Column(JSON)
    structured = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True)
    deleted = Column(Boolean, default=False)
    desc = Column(String(128))

class Config(Base):
    __tablename__ = 'configs'
    key = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True, default=0, index=True)
    value = Column(Text)
    desc = Column(String(128))

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=True)
    is_admin = Column(Boolean, default=False)
    last_login = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

class AlarmRule(Base):
    __tablename__ = 'alarm_rules'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True)
    rule_type = Column(String(32), index=True)  # 任务类型/告警类型
    condition = Column(String(128))  # 触发条件
    notify_type = Column(String(32))  # email/webhook等
    target = Column(String(128))  # 邮箱/URL等
    enabled = Column(Integer, default=1, index=True)
    desc = Column(String(128))
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all) 