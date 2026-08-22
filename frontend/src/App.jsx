import { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';

const API_URL = 'http://localhost:8000/chat';

function getToolStatusFromPrompt(prompt) {
  const lower = prompt.toLowerCase();

  if (/search|look up|find|google|web|browse|docs/.test(lower)) {
    return 'Scanning live sources...';
  }

  if (/memory|remember|recall|save|note/.test(lower)) {
    return 'Reviewing memory context...';
  }

  if (/file|folder|read|write|filesystem|open/.test(lower)) {
    return 'Running file operations...';
  }

  return 'Planning response strategy...';
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('online');
  const [toolStatus, setToolStatus] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, toolStatus]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextUserMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, nextUserMessage];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);
    const predictedToolStatus = getToolStatusFromPrompt(trimmed);
    setToolStatus(predictedToolStatus);
    setStatus(predictedToolStatus ? 'tool' : 'thinking');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || 'Something went wrong while contacting the agent.');
      }

      const data = await response.json();
      const agentMessage = data.message || { role: 'assistant', content: 'No response received.' };
      setMessages((current) => [...current, agentMessage]);
      setStatus('online');
    } catch (err) {
      setStatus('online');
      setError(err.message || 'Unable to reach the backend agent.');
      setMessages((current) => [...current, { role: 'assistant', content: 'Atlas is currently unavailable. Please retry in a moment.' }]);
    } finally {
      setLoading(false);
      setToolStatus('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await sendMessage(input);
  };

  const clearChat = () => {
    setMessages([]);
    setInput('');
    setError('');
    setToolStatus('');
    setStatus('online');
  };

  return (
    <div className="app-shell min-h-screen p-4 text-slate-100 md:p-8">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(37,99,235,0.28),transparent_36%),radial-gradient(circle_at_86%_10%,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,#04060C_0%,#060B15_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:34px_34px] opacity-30" />
      </div>

      <div className="animate-panel-enter relative mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[1.6rem] border border-slate-800/90 bg-slate-950/80 shadow-[0_30px_90px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <Header status={loading ? 'thinking' : status} onClearChat={clearChat} />

        <div ref={scrollRef} className="max-h-[70vh] min-h-[500px] overflow-y-auto">
          <ChatWindow messages={messages} loading={loading} toolStatus={toolStatus} />
        </div>

        {error && (
          <div className="border-t border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200">
            {error}
          </div>
        )}

        <ChatInput
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onSubmit={handleSubmit}
          disabled={loading}
        />
      </div>
    </div>
  );
}

export default App;
