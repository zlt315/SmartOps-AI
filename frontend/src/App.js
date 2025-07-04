import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
const API_BASE = '';

const MODEL_OPTIONS = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '通义百炼', value: 'tongyi' },
];
const HISTORY_KEY = 'smartopsai_chat_history';
const APIKEY_KEY = 'smartopsai_apikeys';
const ANALYZE_HISTORY_KEY = 'smartopsai_analyze_history';
const TASKS_KEY = 'smartopsai_tasks';
const SCENARIOS = [
  { label: '服务器负载分析', prompt: '请帮我分析服务器负载高的原因，并给出优化建议。' },
  { label: '日志异常排查', prompt: '请帮我分析以下日志内容，找出异常和可能的故障原因。' },
  { label: 'Linux常用命令', prompt: 'Linux 常用命令有哪些？' },
  { label: '网络故障排查', prompt: '如何排查服务器网络不通的问题？' },
];
const TOKEN_KEY = 'smartopsai_token';
const USERNAME_KEY = 'smartopsai_username';

function App() {
  const [model, setModel] = useState('deepseek');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamReply, setStreamReply] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState('');
  const [analyzeHistory, setAnalyzeHistory] = useState([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKeys, setApiKeys] = useState({ deepseek: '', tongyi: '' });
  const [tmpKeys, setTmpKeys] = useState({ deepseek: '', tongyi: '' });
  const [tasks, setTasks] = useState([]);
  const streamReplyRef = useRef('');
  const [taskType, setTaskType] = useState('log_analysis');
  const [provider, setProvider] = useState('deepseek');
  const [content, setContent] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [detailTask, setDetailTask] = useState(null);
  const [polling, setPolling] = useState(false);
  const [context, setContext] = useState([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authUsername, setAuthUsername] = useState(localStorage.getItem(USERNAME_KEY) || '');
  const [authPassword, setAuthPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [authError, setAuthError] = useState('');
  const [keyMsg, setKeyMsg] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [modalTask, setModalTask] = useState(null);

  // 聊天历史持久化
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      setHistory(JSON.parse(saved));
    }
    const savedKeys = localStorage.getItem(APIKEY_KEY);
    if (savedKeys) {
      setApiKeys(JSON.parse(savedKeys));
    }
    const savedAnalyze = localStorage.getItem(ANALYZE_HISTORY_KEY);
    if (savedAnalyze) {
      setAnalyzeHistory(JSON.parse(savedAnalyze));
    }
    const savedTasks = localStorage.getItem(TASKS_KEY);
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    localStorage.setItem(APIKEY_KEY, JSON.stringify(apiKeys));
  }, [apiKeys]);
  useEffect(() => {
    localStorage.setItem(ANALYZE_HISTORY_KEY, JSON.stringify(analyzeHistory));
  }, [analyzeHistory]);
  useEffect(() => {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }, [tasks]);

  // 聊天历史清空
  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  // 聊天导出为Markdown
  const exportMarkdown = () => {
    let md = '# SmartOps-AI 对话记录\n\n';
    history.forEach(msg => {
      md += msg.role === 'user' ? `**我：** ${msg.content}\n\n` : `**AI：** ${msg.content}\n\n`;
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartOpsAI-Chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 运维场景快捷入口
  const handleScenario = (promptText) => {
    setPrompt(promptText);
  };

  // 普通对话
  const handleSend = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    const taskId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    setTasks([{ id: taskId, type: 'chat', status: '进行中', desc: prompt, time: new Date().toLocaleString() }, ...tasks]);
    const messages = [
      ...history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })),
      { role: 'user', content: prompt }
    ];
    try {
      const res = await authFetch('http://127.0.0.1:8000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-deepseek-key': apiKeys.deepseek,
          'x-tongyi-key': apiKeys.tongyi,
        },
        body: JSON.stringify({ model, messages }),
      });
      const data = await res.json();
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: data.reply }
      ]);
      setPrompt('');
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: '已完成' } : t));
    } catch (e) {
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: '请求失败，请检查后端服务' }
      ]);
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: '失败' } : t));
    } finally {
      setLoading(false);
    }
  };

  // 流式对话
  const handleStreamSend = async () => {
    if (!prompt.trim()) return;
    setStreaming(true);
    setStreamReply('');
    streamReplyRef.current = '';
    const messages = [
      ...history.map(msg => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })),
      { role: 'user', content: prompt }
    ];
    try {
      const res = await authFetch('http://127.0.0.1:8000/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-deepseek-key': apiKeys.deepseek,
        },
        body: JSON.stringify({ model: 'deepseek', messages }),
      });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      let aiContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        aiContent += chunk;
        streamReplyRef.current = aiContent;
        setStreamReply(aiContent);
      }
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: streamReplyRef.current }
      ]);
      setPrompt('');
    } catch (e) {
      setHistory([
        ...history,
        { role: 'user', content: prompt },
        { role: 'ai', content: '流式请求失败，请检查后端服务' }
      ]);
    } finally {
      setStreaming(false);
    }
  };

  // 文件上传分析
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadResult('');
    const taskId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    setTasks([{ id: taskId, type: 'analyze', status: '进行中', desc: file.name, time: new Date().toLocaleString() }, ...tasks]);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);
    try {
      const res = await authFetch('http://127.0.0.1:8000/analyze', {
        method: 'POST',
        headers: {
          'x-deepseek-key': apiKeys.deepseek,
          'x-tongyi-key': apiKeys.tongyi,
        },
        body: formData,
      });
      const data = await res.json();
      setUploadResult(data.result || '无分析结果');
      setAnalyzeHistory([
        { filename: file.name, result: data.result || '无分析结果', time: new Date().toLocaleString() },
        ...analyzeHistory.slice(0, 19)
      ]);
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: '已完成' } : t));
    } catch (e) {
      setUploadResult('文件分析失败，请检查后端服务');
      setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: '失败' } : t));
    } finally {
      setUploading(false);
    }
  };

  // API Key 配置弹窗
  const openKeyModal = () => {
    setTmpKeys(apiKeys);
    setShowKeyModal(true);
  };
  // 登录/切换用户后自动获取 API Key
  useEffect(() => {
    if (token) {
      Promise.all([
        authFetch('http://127.0.0.1:8000/api/config?model=deepseek'),
        authFetch('http://127.0.0.1:8000/api/config?model=tongyi')
      ]).then(async ([res1, res2]) => {
        const data1 = await res1.json();
        const data2 = await res2.json();
        setApiKeys({
          deepseek: data1.value || '',
          tongyi: data2.value || ''
        });
      });
    }
  }, [token]);

  // API Key 配置弹窗保存
  const saveKeys = async () => {
    setKeyMsg('');
    try {
      await Promise.all([
        authFetch('http://127.0.0.1:8000/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek', api_key: tmpKeys.deepseek })
        }),
        authFetch('http://127.0.0.1:8000/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'tongyi', api_key: tmpKeys.tongyi })
        })
      ]);
      setApiKeys(tmpKeys);
      setShowKeyModal(false);
      setKeyMsg('保存成功！');
      setTimeout(() => setKeyMsg(''), 1500);
    } catch {
      setKeyMsg('保存失败');
    }
  };

  // ReactMarkdown渲染器，支持代码高亮和表格美化
  const renderers = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter style={oneLight} language={match[1]} PreTag="div" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props} style={{ background: '#f6f8fa', borderRadius: 3, padding: '2px 4px' }}>{children}</code>
      );
    },
    table({ children }) {
      return <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff' }}>{children}</table>;
    },
    th({ children }) {
      return <th style={{ border: '1px solid #ddd', padding: '4px 8px', background: '#f6f8fa' }}>{children}</th>;
    },
    td({ children }) {
      return <td style={{ border: '1px solid #ddd', padding: '4px 8px' }}>{children}</td>;
    },
  };

  // 移动端适配样式
  const mainStyle = {
    maxWidth: 700,
    margin: '40px auto',
    padding: 24,
    border: '1px solid #eee',
    borderRadius: 8,
    background: '#fafbfc',
    boxSizing: 'border-box',
    minHeight: '100vh',
    width: '100%',
  };
  const inputStyle = {
    width: '100%',
    maxWidth: 300,
    marginRight: 8,
    boxSizing: 'border-box',
    fontSize: 16,
    padding: '4px 8px',
  };
  const btnStyle = {
    fontSize: 15,
    padding: '4px 14px',
    borderRadius: 4,
    border: '1px solid #ddd',
    background: '#f6f8fa',
    cursor: 'pointer',
    marginRight: 8,
  };
  const clearBtnStyle = {
    ...btnStyle,
    color: '#f33',
    border: '1px solid #f33',
    background: '#fff',
    marginLeft: 12,
  };

  // 获取历史
  const fetchHistory = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/history`);
      const data = await res.json();
      // 聊天区消息
      let msgs = [];
      if (Array.isArray(data)) {
        data.forEach(task => {
          if (task.prompt) msgs.push({ role: 'user', content: task.prompt });
          if (task.result) msgs.push({ role: 'ai', content: task.result });
        });
      }
      setHistory(msgs);
      // 任务区
      setTasks(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistory([]);
      setTasks([]);
    }
  };
  useEffect(() => {
    if (token) fetchHistory();
  }, [token]);

  // 提交任务（支持多轮对话context）
  const handleSubmit = async (e, customContext) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await authFetch('http://127.0.0.1:8000/api/task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-deepseek-key': apiKeys.deepseek,
          'x-tongyi-key': apiKeys.tongyi,
        },
        body: JSON.stringify({ task_type: taskType, provider, content, context: customContext || (context.length > 0 ? { history: context } : undefined) })
      });
      const data = await res.json();
      if (data.status === 'completed') {
        setResult(data);
        fetchHistory();
        setContext([]); // 新任务后清空上下文
      } else {
        setError(data.result || '任务处理失败');
      }
    } catch (e) {
      setError('请求失败，请检查后端服务');
    } finally {
      setLoading(false);
    }
  };

  // 查询任务详情（支持进度轮询）
  const fetchTaskDetail = async (taskId, poll = false) => {
    setDetailTask(null);
    setPolling(poll);
    let timer = null;
    const getDetail = async () => {
      try {
        const res = await authFetch('http://127.0.0.1:8000/api/status?task_id=' + taskId);
        const data = await res.json();
        setDetailTask(data);
        if (poll && data.status && data.status !== 'completed' && data.status !== 'failed') {
          timer = setTimeout(getDetail, 2000);
        } else {
          setPolling(false);
        }
      } catch (e) {
        setDetailTask({ status: 'failed', result: '查询失败' });
        setPolling(false);
      }
    };
    getDetail();
    return () => timer && clearTimeout(timer);
  };

  // 结构化结果美化
  const renderStructured = (task) => {
    const keys = ['问题', '原因', '建议', '措施', '分析', '优化'];
    return (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {keys.map(k => task[k] && (
          <div key={k} style={{ background: '#f6f8fa', borderLeft: '4px solid #0077cc', borderRadius: 6, padding: '8px 14px', minWidth: 120, marginBottom: 6 }}>
            <b style={{ color: '#0077cc' }}>{k}：</b>
            <span>{task[k]}</span>
          </div>
        ))}
      </div>
    );
  };

  // 继续追问（多轮对话）
  const handleContinue = (task) => {
    setTaskType(task.task_type);
    setProvider(task.provider);
    setContext([...(context || []), task.result]);
    setContent('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 检查登录态，未登录强制弹窗
  useEffect(() => {
    if (!token) setShowAuthModal(true);
  }, [token]);

  // 登录/注册请求
  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    if (!authUsername || !authPassword) {
      setAuthError('请输入用户名和密码');
      setAuthLoading(false);
      return;
    }
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setToken(data.access_token);
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(USERNAME_KEY, authUsername);
        setShowAuthModal(false);
        setAuthPassword('');
        setAuthError('');
        fetchHistory();
      } else {
        setAuthError(data.detail || '认证失败');
      }
    } catch (e) {
      setAuthError('请求失败，请检查网络连接');
    } finally {
      setAuthLoading(false);
    }
  };

  // 回车键提交
  const handleAuthKeyDown = (e) => {
    if (e.key === 'Enter' && !authLoading) {
      handleAuth();
    }
  };

  // 登出
  const handleLogout = () => {
    setToken('');
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setShowAuthModal(true);
    setHistory([]);
    setTasks([]);
  };

  // fetch 封装，自动带 token
  const authFetch = (url, options = {}) => {
    const headers = { ...(options.headers || {}), Authorization: token ? `Bearer ${token}` : undefined };
    return fetch(url, { ...options, headers });
  };

  const openTaskModal = (task) => {
    setModalTask(task);
    setShowTaskModal(true);
  };
  const closeTaskModal = () => {
    setShowTaskModal(false);
    setModalTask(null);
  };

  return (
    <div style={mainStyle}>
      <div style={{ position: 'absolute', right: 32, top: 24, zIndex: 30 }}>
        {token && authUsername && (
          <span style={{ marginRight: 12, color: '#0077cc' }}>欢迎，{authUsername}</span>
        )}
        {token && (
          <button onClick={handleLogout} style={{ ...btnStyle, padding: '2px 10px', fontSize: 14 }}>登出</button>
        )}
      </div>
      <h2 style={{ fontSize: 22 }}>SmartOps-AI 智能运维助手 <button style={{ float: 'right', ...btnStyle }} onClick={openKeyModal}>API Key配置</button></h2>
      {/* 聊天导出按钮 */}
      <div style={{ marginBottom: 8 }}>
        <button onClick={exportMarkdown} style={btnStyle}>导出对话(Markdown)</button>
      </div>
      {/* 任务列表区优化 */}
      <div style={{ marginBottom: 12, background: '#f6f8fa', borderRadius: 4, padding: 10 }}>
        <b>任务列表：</b>
        {tasks.length === 0 && <span style={{ color: '#aaa', marginLeft: 8 }}>暂无任务，开始对话或分析文件吧</span>}
        {tasks.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {tasks.slice(0, 10).map(t => (
              <li key={t.id} style={{ marginBottom: 2 }}>
                <span style={{ color: t.type === 'chat' ? '#0077cc' : '#f90' }}>{t.type === 'chat' ? '对话' : '分析'}</span>
                <span style={{ margin: '0 8px' }}>{t.desc}</span>
                <span style={{ 
                  color: t.status === '已完成' ? '#28a745' : t.status === '失败' ? '#dc3545' : '#6c757d',
                  fontWeight: 'bold'
                }}>{t.status}</span>
                <span style={{ marginLeft: 8, color: '#aaa', fontSize: 12 }}>{t.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* API Key 配置弹窗 */}
      {showKeyModal && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.2)', zIndex: 10 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 340, margin: '120px auto', boxShadow: '0 2px 8px #0002' }}>
            <h3>API Key 配置</h3>
            <div style={{ marginBottom: 12 }}>
              <b>DeepSeek Key：</b>
              <input type="text" value={tmpKeys.deepseek} onChange={e => setTmpKeys({ ...tmpKeys, deepseek: e.target.value })} style={{ width: 220 }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <b>通义百炼 Key：</b>
              <input type="text" value={tmpKeys.tongyi} onChange={e => setTmpKeys({ ...tmpKeys, tongyi: e.target.value })} style={{ width: 220 }} />
            </div>
            {keyMsg && <div style={{ color: keyMsg === '保存成功！' ? 'green' : 'red', marginBottom: 8 }}>{keyMsg}</div>}
            <button onClick={saveKeys} style={{ marginRight: 12 }}>保存</button>
            <button onClick={() => setShowKeyModal(false)}>取消</button>
          </div>
        </div>
      )}
      {/* 运维场景快捷入口 */}
      <div style={{ marginBottom: 12 }}>
        <b>常见运维场景：</b>
        {SCENARIOS.map(s => (
          <button key={s.label} style={btnStyle} onClick={() => handleScenario(s.prompt)}>{s.label}</button>
        ))}
      </div>
      {/* 文件上传区 */}
      <div style={{ marginBottom: 16, background: '#f6f8fa', padding: 12, borderRadius: 4 }}>
        <b>日志/文件分析：</b>
        <input type="file" accept=".log,.txt,.conf,.json,.yaml,.yml" onChange={handleFileChange} disabled={uploading} style={{ marginLeft: 8 }} />
        {uploading && <span style={{ marginLeft: 8, color: '#0077cc' }}>分析中...</span>}
        {uploadResult && (
          <div style={{ marginTop: 12, background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #eee' }}>
            <div style={{ color: '#0077cc', marginBottom: 8, fontWeight: 'bold' }}>分析结果：</div>
            <ReactMarkdown components={renderers}>{uploadResult}</ReactMarkdown>
          </div>
        )}
        {/* 文件分析历史 */}
        {analyzeHistory.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <b>分析历史：</b>
            <ul style={{ paddingLeft: 18 }}>
              {analyzeHistory.map((item, idx) => (
                <li key={idx} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#888' }}>{item.time}</span> - <b>{item.filename}</b>
                  <details>
                    <summary style={{ cursor: 'pointer', color: '#0077cc' }}>查看分析结果</summary>
                    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 4, padding: 8, marginTop: 4 }}>
                      <ReactMarkdown components={renderers}>{item.result}</ReactMarkdown>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={model} onChange={e => setModel(e.target.value)} style={{ marginRight: 8, fontSize: 15, padding: '4px 8px' }}>
          {MODEL_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="请输入运维问题..."
          style={inputStyle}
          onKeyDown={e => { if (e.key === 'Enter' && !loading && !streaming) (model === 'deepseek' ? handleStreamSend() : handleSend()); }}
          disabled={loading || streaming}
        />
        {model === 'deepseek' ? (
          <button onClick={handleStreamSend} disabled={loading || streaming} style={btnStyle}>{streaming ? '流式中...' : '流式对话'}</button>
        ) : (
          <button onClick={handleSend} disabled={loading} style={btnStyle}>{loading ? '发送中...' : '发送'}</button>
        )}
        <button onClick={clearHistory} style={clearBtnStyle}>清空历史</button>
      </div>
      {/* 聊天区优化 */}
      <div style={{ minHeight: 80, background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #eee', maxHeight: 400, overflowY: 'auto', fontSize: 16 }}>
        {history.length === 0 && !streaming && (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>开始对话</div>
            <div>输入运维问题，AI 将为您提供专业建议</div>
          </div>
        )}
        {history.map((msg, idx) => (
          <div key={idx} style={{ 
            margin: '12px 0', 
            display: 'flex', 
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
            alignItems: 'flex-start'
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 12,
              background: msg.role === 'user' ? '#0077cc' : '#f1f3f4',
              color: msg.role === 'user' ? 'white' : '#333',
              wordBreak: 'break-word'
            }}>
              <ReactMarkdown components={renderers}>{msg.content}</ReactMarkdown>
            </div>
            <div style={{ 
              margin: msg.role === 'user' ? '0 8px 0 0' : '0 0 0 8px',
              fontSize: 12, 
              color: '#aaa',
              alignSelf: 'flex-end'
            }}>
              {msg.role === 'user' ? '我' : 'AI'}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ 
            margin: '12px 0', 
            display: 'flex', 
            alignItems: 'flex-start'
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '8px 12px',
              borderRadius: 12,
              background: '#f1f3f4',
              color: '#333',
              wordBreak: 'break-word'
            }}>
              <ReactMarkdown components={renderers}>{streamReply}</ReactMarkdown>
            </div>
            <div style={{ 
              margin: '0 0 0 8px',
              fontSize: 12, 
              color: '#aaa',
              alignSelf: 'flex-end'
            }}>
              AI
            </div>
          </div>
        )}
      </div>
      {/* 任务历史表格优化 */}
      <div style={{ marginBottom: 20 }}>
        <h3>任务历史</h3>
        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', background: '#f9f9f9', borderRadius: 8 }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>暂无任务历史</div>
            <div>开始对话或分析文件，任务将在这里显示</div>
          </div>
        ) : (
          <table style={{ width: '100%', background: '#fff', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f6f8fa' }}>
                <th style={{ border: '1px solid #eee', padding: 8 }}>任务ID</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>类型</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>状态</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>AI</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>时间</th>
                <th style={{ border: '1px solid #eee', padding: 8 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.task_id}>
                  <td style={{ border: '1px solid #eee', padding: 8, fontSize: 12 }}>{task.task_id}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{task.model || '-'}</td>
                  <td style={{ 
                    border: '1px solid #eee', 
                    padding: 8, 
                    color: task.status === 'completed' ? '#28a745' : task.status === 'failed' ? '#dc3545' : '#6c757d',
                    fontWeight: 'bold'
                  }}>{task.status}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>{task.model || '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8, fontSize: 12 }}>{task.timestamp ? (typeof task.timestamp === 'string' ? task.timestamp : new Date(task.timestamp).toLocaleString()) : '-'}</td>
                  <td style={{ border: '1px solid #eee', padding: 8 }}>
                    <button onClick={() => openTaskModal(task)} style={{ padding: '4px 12px', fontSize: 12, marginRight: 4 }}>详情</button>
                    <button onClick={() => handleContinue(task)} style={{ padding: '4px 12px', fontSize: 12 }}>继续追问</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {detailTask && (
        <div style={{ background: '#f9f9f9', padding: 18, borderRadius: 8, marginBottom: 20 }}>
          <h3>任务详情 {polling && <span style={{ color: '#888', fontSize: 14 }}>（进度轮询中...）</span>}</h3>
          <div><b>任务ID:</b> {detailTask.task_id}</div>
          <div><b>状态:</b> {detailTask.status}</div>
          <div><b>AI提供商:</b> {detailTask.provider}</div>
          <div><b>分析结果:</b></div>
          <pre style={{ background: '#fff', padding: 10, borderRadius: 4 }}>{detailTask.result}</pre>
          {renderStructured(detailTask)}
          {detailTask.suggestions && detailTask.suggestions.length > 0 && (
            <div><b>建议:</b><ul>{detailTask.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
        </div>
      )}
      {showAuthModal && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.2)', zIndex: 20 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, width: 340, margin: '120px auto', boxShadow: '0 2px 8px #0002' }}>
            <h3>{authMode === 'login' ? '登录' : '注册'} SmartOps-AI</h3>
            <div style={{ marginBottom: 12 }}>
              <b>用户名：</b>
              <input 
                type="text" 
                value={authUsername} 
                onChange={e => setAuthUsername(e.target.value)} 
                onKeyDown={handleAuthKeyDown}
                style={{ width: 220 }} 
                disabled={authLoading}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <b>密码：</b>
              <input 
                type="password" 
                value={authPassword} 
                onChange={e => setAuthPassword(e.target.value)} 
                onKeyDown={handleAuthKeyDown}
                style={{ width: 220 }} 
                disabled={authLoading}
              />
            </div>
            {authError && <div style={{ color: 'red', marginBottom: 8, fontSize: 14 }}>{authError}</div>}
            <button 
              onClick={handleAuth} 
              disabled={authLoading}
              style={{ 
                marginRight: 12, 
                background: authLoading ? '#ccc' : '#0077cc', 
                color: 'white',
                border: 'none',
                padding: '6px 16px',
                borderRadius: 4,
                cursor: authLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {authLoading ? '处理中...' : (authMode === 'login' ? '登录' : '注册')}
            </button>
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')} 
              disabled={authLoading}
              style={{ marginRight: 12 }}
            >
              {authMode === 'login' ? '没有账号？注册' : '已有账号？登录'}
            </button>
            <button onClick={() => setShowAuthModal(false)} disabled={authLoading}>取消</button>
          </div>
        </div>
      )}
      {showTaskModal && modalTask && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.25)', zIndex: 30 }}>
          <div style={{ background: '#fff', borderRadius: 10, width: 480, maxWidth: '96vw', margin: '60px auto', boxShadow: '0 4px 24px #0003', padding: 28, position: 'relative' }}>
            <button onClick={closeTaskModal} style={{ position: 'absolute', right: 18, top: 18, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>×</button>
            <h3 style={{ marginBottom: 12 }}>任务详情</h3>
            <div style={{ marginBottom: 8 }}><b>任务ID：</b>{modalTask.task_id}</div>
            <div style={{ marginBottom: 8 }}><b>类型：</b>{modalTask.model || '-'}</div>
            <div style={{ marginBottom: 8 }}><b>状态：</b><span style={{ color: modalTask.status === 'completed' ? '#28a745' : modalTask.status === 'failed' ? '#dc3545' : '#6c757d', fontWeight: 'bold' }}>{modalTask.status}</span></div>
            <div style={{ marginBottom: 8 }}><b>时间：</b>{modalTask.timestamp ? (typeof modalTask.timestamp === 'string' ? modalTask.timestamp : new Date(modalTask.timestamp).toLocaleString()) : '-'}</div>
            <div style={{ marginBottom: 8 }}><b>Prompt：</b><div style={{ background: '#f6f8fa', borderRadius: 6, padding: 8, marginTop: 4 }}>{modalTask.prompt}</div></div>
            <div style={{ marginBottom: 8 }}><b>AI回复：</b><div style={{ background: '#f6f8fa', borderRadius: 6, padding: 8, marginTop: 4 }}><ReactMarkdown components={renderers}>{modalTask.result}</ReactMarkdown></div></div>
            {modalTask.structured && Object.keys(modalTask.structured).length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <b>结构化结果：</b>
                <div style={{ marginTop: 4 }}>
                  {Object.entries(modalTask.structured).map(([k, v]) => (
                    <div key={k} style={{ background: '#eaf6ff', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}><b>{k}：</b>{v}</div>
                  ))}
                </div>
              </div>
            )}
            {modalTask.suggestions && modalTask.suggestions.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <b>建议：</b>
                <ul style={{ margin: '4px 0 0 18px' }}>
                  {modalTask.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {modalTask.messages && Array.isArray(modalTask.messages) && modalTask.messages.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <b>消息历史：</b>
                <div style={{ background: '#f9f9f9', borderRadius: 4, padding: 8, marginTop: 4, maxHeight: 120, overflowY: 'auto' }}>
                  {modalTask.messages.map((m, i) => (
                    <div key={i} style={{ color: m.role === 'user' ? '#0077cc' : '#333', marginBottom: 4 }}><b>{m.role}：</b>{m.content}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App; 