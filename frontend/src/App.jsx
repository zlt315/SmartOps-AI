import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

const MODEL_OPTIONS = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '通义百炼', value: 'tongyi' },
];

function App() {
  const [model, setModel] = useState('deepseek');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    // 构造多轮消息数组
    const messages = [
      ...history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })),
      { role: 'user', content: prompt }
    ];
    try {
      const res = await fetch('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages }),
      });
      const data = await res.json();
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: data.reply }
      ]);
      setPrompt('');
    } catch (e) {
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: '请求失败，请检查后端服务' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: 24, border: '1px solid #eee', borderRadius: 8, background: '#fafbfc' }}>
      <h2>SmartOps-AI 智能运维助手</h2>
      <div style={{ marginBottom: 16 }}>
        <select value={model} onChange={e => setModel(e.target.value)} style={{ marginRight: 8 }}>
          {MODEL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="请输入运维问题..."
          style={{ width: 300, marginRight: 8 }}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
        />
        <button onClick={handleSend} disabled={loading}>{loading ? '发送中...' : '发送'}</button>
      </div>
      <div style={{ minHeight: 80, background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #eee', maxHeight: 400, overflowY: 'auto' }}>
        {history.length === 0 && <div style={{ color: '#aaa' }}>暂无对话</div>}
        {history.map((msg, idx) => (
          <div key={idx} style={{ color: msg.role === 'user' ? '#333' : '#0077cc', margin: '6px 0' }}>
            <b>{msg.role === 'user' ? '我：' : 'AI：'}</b>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App; 