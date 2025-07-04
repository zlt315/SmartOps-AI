# SmartOps-AI

智能运维助手 MVP

## 目录结构

```
SmartOps-AI/
├── backend/         # FastAPI后端
│   ├── app.py
│   ├── apis/
│   │   ├── deepseek.py
│   │   └── tongyi.py
│   └── requirements.txt
├── frontend/        # React前端
│   ├── package.json
│   └── src/
├── README.md
```

## 启动方式

### 后端
```bash
cd backend
# Windows
venv\Scripts\activate
# 启动 FastAPI
uvicorn app:app --reload
```

### 前端
```bash
cd frontend
npm start
```

## 依赖
- 后端：FastAPI, Uvicorn
- 前端：React (create-react-app)

---
如需对接 DeepSeek/通义百炼API，请在 backend/apis/ 目录下开发对应接口。 