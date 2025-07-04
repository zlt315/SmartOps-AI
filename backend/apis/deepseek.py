import os
import httpx
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"  # 假设API地址

async def call_deepseek(messages: list) -> str:
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "deepseek-chat",  # 根据实际API调整
        "messages": messages
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(DEEPSEEK_API_URL, headers=headers, json=data, timeout=60)
        resp.raise_for_status()
        result = resp.json()
        # 假设返回格式为 result['choices'][0]['message']['content']
        return result['choices'][0]['message']['content']

async def call_deepseek_stream(messages: list):
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "deepseek-chat",
        "messages": messages,
        "stream": True
    }
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", DEEPSEEK_API_URL, headers=headers, json=data) as resp:
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    content = line[6:].strip()
                    if content == "[DONE]":
                        break
                    # DeepSeek流式返回格式假设为{"choices":[{"delta":{"content":"..."}}]}
                    try:
                        import json
                        delta = json.loads(content)
                        chunk = delta['choices'][0]['delta'].get('content', '')
                        if chunk:
                            yield chunk
                    except Exception:
                        continue
