import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession  # noqa: F401
from sqlalchemy.orm import sessionmaker, declarative_base  # noqa: F401
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON  # noqa: F401
from datetime import datetime

DB_URL = os.getenv('DB_URL', 'sqlite+aiosqlite:///./smartops.db')
engine = create_async_engine(DB_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

class Task(Base):
    __tablename__ = 'tasks'
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, index=True)
    status = Column(String(32))
    model = Column(String(32))
    prompt = Column(Text)
    messages = Column(JSON)
    result = Column(Text)
    suggestions = Column(JSON)
    structured = Column(JSON)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user_id = Column(String(64), nullable=True)

class Config(Base):
    __tablename__ = 'configs'
    key = Column(String(64), primary_key=True)
    user_id = Column(Integer, primary_key=True, default=0)
    value = Column(Text)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    password_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all) 