import { useEffect, useRef, useState } from 'react';
import Header from './components/Header';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';

const API_URL = 'http://localhost:8000/chat';

function getToolStatusFromPrompt(prompt) {
  const lower = prompt.toLowerCase();

  if (/search|look up|find|google|web|browse|docs/.test(lower)) {
    return '🔍 Searching web...';
  }

  if (/memory|remember|recall|save|note/.test(lower)) {
    return '🍃 Recalled memory...';
  }

  if (/file|folder|read|write|filesystem|open/.test(lower)) {
    return '📁 Filesystem operation...';
  }

  return '🧭 Preparing response...';
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
    setStatus('thinking');
    setToolStatus(getToolStatusFromPrompt(trimmed));

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
      setMessages((current) => [...current, { role: 'assistant', content: 'The agent seems to be offline right now. Please try again in a moment.' }]);
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
    <div className="min-h-screen bg-[#F3ECE0] p-4 font-[Fredoka,sans-serif] text-[#3E2E28] md:p-8">
      <div className="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[2rem] border-[6px] border-[#5D4037] bg-[#FAF6E9] shadow-[0_12px_0_#5D4037]">
        <Header status={loading ? 'thinking' : status} onClearChat={clearChat} />

        <div ref={scrollRef} className="max-h-[70vh] min-h-[500px] overflow-y-auto">
          <ChatWindow messages={messages} loading={loading} toolStatus={toolStatus} />
        </div>

        {error && (
          <div className="border-t-4 border-[#5D4037] bg-[#FFE1D7] px-4 py-3 text-sm font-semibold text-[#6B2F20]">
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
