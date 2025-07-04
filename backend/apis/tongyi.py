import os
import httpx
from dotenv import load_dotenv

load_dotenv()

TONGYI_API_KEY = os.getenv("TONGYI_API_KEY", "")
TONGYI_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"  # 假设API地址

def messages_to_prompt(messages):
    prompt = ""
    for msg in messages:
        if msg["role"] == "user":
            prompt += f"用户：{msg['content']}\n"
        else:
            prompt += f"助手：{msg['content']}\n"
    return prompt

async def call_tongyi(messages: list) -> str:
    headers = {
        "Authorization": f"Bearer {TONGYI_API_KEY}",
        "Content-Type": "application/json"
    }
    prompt = messages_to_prompt(messages)
    data = {
        "model": "qwen-turbo",  # 根据实际API调整
        "input": {"prompt": prompt}
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(TONGYI_API_URL, headers=headers, json=data, timeout=30)
        resp.raise_for_status()
        result = resp.json()
        # 假设返回格式为 result['output']['text']
        return result['output']['text']
