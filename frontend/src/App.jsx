import { useEffect, useRef, useState } from "react";
import {
  Icon,
  LiquidCore,
  Waveform,
  ExecutionCard,
  Message,
  Telemetry,
} from "./components/SpatialUI";
import MemoryLibrary from "./components/MemoryLibrary";
import { backendHeaders, readChatEvents, resolveBackend } from "./backendClient";
import "./App.css";

const BUILD_VERSION = process.env.REACT_APP_BUILD_VERSION || "0.4.3-dev";
function newConversationId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
    const value = Math.floor(Math.random() * 16);
    return (letter === "x" ? value : (value & 3) | 8).toString(16);
  });
}
const suggestions = [
  {
    icon: "globe",
    color: "cyan",
    title: "Follow your curiosity",
    description: "Research a topic. Connect the dots.",
    prompt:
      "Research the latest developments in local AI models and summarize the key ideas with sources.",
  },
  {
    icon: "code",
    color: "violet",
    title: "Make something great",
    description: "From a first thought to a working idea.",
    prompt:
      "Help me plan and build a small project. Start by asking what I want to create.",
  },
  {
    icon: "spark",
    color: "amber",
    title: "Find your focus",
    description: "Turn a little chaos into a clear plan.",
    prompt:
      "Help me organize my priorities for today. Ask me about my tasks and deadlines.",
  },
];
const demoText =
  'A calmer workspace starts with a little structure. I’ve grouped this example into three focused areas: **ideas**, **in progress**, and **ready to share**.\n\nHere’s a small starting point you can make your own.\n\n```javascript\nconst workspace = {\n  ideas: [],\n  inProgress: ["Something extraordinary"],\n  readyToShare: []\n};\n\nconsole.log(workspace);\n```';

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatFileDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
}

export default function App() {
  const [view, setView] = useState("Overview");
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760);
  const [telemetry, setTelemetry] = useState(false);
  const [messages, setMessages] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [conversationSearchResults, setConversationSearchResults] = useState(null);
  const [conversationSearchRevision, setConversationSearchRevision] = useState(0);
  const [editingConversationId, setEditingConversationId] = useState(null);
  const [conversationTitleDraft, setConversationTitleDraft] = useState("");
  const [conversationTitles, setConversationTitles] = useState({});
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [toolActivity, setToolActivity] = useState("");
  const [connection, setConnection] = useState("checking");
  const [modelStatus, setModelStatus] = useState("checking");
  const [modelName, setModelName] = useState("qwen3:4b");
  const [installedModels, setInstalledModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return window.localStorage.getItem("atlas.selectedModel") || ""; }
    catch { return ""; }
  });
  const [telemetryData, setTelemetryData] = useState(null);
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewContent, setPreviewContent] = useState("");
  const [context, setContext] = useState({ research: false, memory: false });
  const [contextFeatures, setContextFeatures] = useState({ web_research: true, memory: true, files: true });
  const [listening, setListening] = useState(false);
  const [started, setStarted] = useState(null);
  const inputRef = useRef(null),
    fileRef = useRef(null),
    feedRef = useRef(null),
    requestRef = useRef(null),
    speechRef = useRef(null),
    apiRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const openedConversationRef = useRef(null);
  const busy = phase !== "idle";
  const visibleConversations = conversationSearch.trim()
    ? conversationSearchResults || []
    : savedConversations;
  const activeModel = installedModels.length
    ? selectedModel && installedModels.includes(selectedModel)
      ? selectedModel
      : installedModels.includes(modelName) ? modelName : installedModels[0]
    : selectedModel || modelName;

  useEffect(() => {
    let cancelled = false;
    let timer;
    const controller = new AbortController();
    async function checkStatus() {
      try {
        const connectionInfo = apiRef.current || await resolveBackend();
        apiRef.current = connectionInfo;
        const response = await fetch(`${connectionInfo.baseUrl}/status`, {
          headers: backendHeaders(connectionInfo.token),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Backend unavailable");
        const result = await response.json();
        if (!cancelled) {
          setConnection("online");
          setModelStatus(result.model?.state || "unavailable");
          setModelName(result.model?.name || "qwen3:4b");
          setInstalledModels(Array.isArray(result.model?.available) ? result.model.available : []);
          setContextFeatures(result.features || { web_research: true, memory: true, files: true });
          setTelemetryData(result.telemetry || null);
        }
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setConnection("offline");
          setModelStatus("unavailable");
        }
      } finally {
        if (!cancelled) timer = setTimeout(checkStatus, 5000);
      }
    }
    checkStatus();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
      requestRef.current?.abort();
      speechRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (connection !== "online") return;
    let cancelled = false;
    async function loadConversations() {
      try {
        const info = apiRef.current || await resolveBackend();
        const response = await fetch(`${info.baseUrl}/conversations`, {
          headers: backendHeaders(info.token),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setSavedConversations(data.conversations || []);
      } catch {
        // A temporary backend failure is already shown by the status poll.
      }
    }
    loadConversations();
    async function loadWorkspaceFiles() {
      try {
        const info = apiRef.current || await resolveBackend();
        const response = await fetch(`${info.baseUrl}/files`, { headers: backendHeaders(info.token) });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setFiles(data.files || []);
      } catch {
        // The connection status already reports temporary backend failures.
      }
    }
    loadWorkspaceFiles();
    return () => { cancelled = true; };
  }, [connection]);
  useEffect(() => {
    const search = conversationSearch.trim();
    if (!search) {
      setConversationSearchResults(null);
      return undefined;
    }
    if (connection !== "online") return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const info = apiRef.current || await resolveBackend();
        const response = await fetch(`${info.baseUrl}/conversations?search=${encodeURIComponent(search)}`, {
          headers: backendHeaders(info.token),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setConversationSearchResults(data.conversations || []);
      } catch {
        // Search remains local to this installation and retries as the query changes.
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [conversationSearch, conversationSearchRevision, connection]);
  useEffect(() => {
    if (!activeConversationId || !messages.length || phase !== "idle" || connection !== "online") return;
    if (openedConversationRef.current === activeConversationId) {
      openedConversationRef.current = null;
      return;
    }
    const id = activeConversationId;
    const title = conversationTitles[id] || messages.find((message) => message.role === "user")?.content.trim().slice(0, 120) || "Conversation";
    const snapshot = messages.map(({ role, content }) => ({ role, content }));
    let current = true;
    saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(async () => {
      const info = apiRef.current || await resolveBackend();
      const response = await fetch(`${info.baseUrl}/conversations/${id}`, {
        method: "PUT",
        headers: backendHeaders(info.token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ title, messages: snapshot }),
      });
      if (!response.ok) throw new Error("Could not save this conversation.");
      if (current) {
        setSavedConversations((existing) => [
          { id, title },
          ...existing.filter((item) => item.id !== id),
        ]);
        setConversationSearchRevision((revision) => revision + 1);
      }
    }).catch(() => {
      if (current) setNotice("Could not save this conversation locally. Retry when Atlas is connected.");
    });
    return () => { current = false; };
  }, [activeConversationId, messages, phase, connection, conversationTitles]);
  useEffect(() => {
    if (view === "Conversation")
      feedRef.current?.scrollTo?.({
        top: feedRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages, phase, previewContent, view]);
  useEffect(() => {
    if (!preview) return;
    setPhase("thinking");
    setPreviewStep(0);
    setPreviewContent("");
    const tool = setTimeout(() => {
      setPhase("tool");
      setPreviewStep(1);
    }, 1600);
    const stream = setTimeout(() => {
      setPhase("streaming");
      setPreviewStep(2);
    }, 3400);
    return () => {
      clearTimeout(tool);
      clearTimeout(stream);
    };
  }, [preview]);
  useEffect(() => {
    if (!preview || phase !== "streaming") return;
    let offset = 0;
    const timer = setInterval(() => {
      offset += 7;
      setPreviewContent(demoText.slice(0, offset));
      if (offset >= demoText.length) {
        clearInterval(timer);
        setPhase("idle");
        setPreviewStep(3);
      }
    }, 24);
    return () => clearInterval(timer);
  }, [preview, phase]);
  useEffect(() => {
    const handleKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setTelemetry(false);
        speechRef.current?.abort();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  function reset() {
    requestRef.current?.abort();
    requestRef.current = null;
    speechRef.current?.abort();
    setListening(false);
    setPreview(false);
    setMessages([]);
    setActiveConversationId(null);
    setPhase("idle");
    setToolActivity("");
    setInput("");
    setSelectedFile(null);
    setNotice("");
    setView("Overview");
    if (window.innerWidth <= 760) setSidebar(false);
  }
  async function sendMessage(text) {
    if (!text.trim() || busy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const history = [...messages, { role: "user", content: text }];
    if (!activeConversationId) setActiveConversationId(newConversationId());
    setPreview(false);
    setMessages(history);
    setView("Conversation");
    setInput("");
    setNotice("");
    setPhase("thinking");
    setToolActivity("");
    setStarted(Date.now());
    const payload = history.slice(-100).map((m) => ({ role: m.role, content: m.content }));
    const sentAttachment = selectedFile;
    let sawTokens = false;
    let completed = false;
    try {
      const connectionInfo = apiRef.current || await resolveBackend();
      apiRef.current = connectionInfo;
      const response = await fetch(`${connectionInfo.baseUrl}/chat/stream`, {
        method: "POST",
        headers: backendHeaders(connectionInfo.token, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          messages: payload,
          ...(activeModel !== modelName ? { model: activeModel } : {}),
          context,
          attachments: sentAttachment ? [sentAttachment.path] : [],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Atlas could not complete this request.");
      }
      await readChatEvents(response, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "token") {
          setPhase("streaming");
          if (!sawTokens) {
            sawTokens = true;
            setMessages((current) => [...current, { role: "assistant", content: event.text }]);
          } else {
            setMessages((current) => {
              const next = [...current];
              next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + event.text };
              return next;
            });
          }
        } else if (event.type === "tool") {
          setToolActivity(event.name);
          setPhase(event.phase === "started" ? "tool" : "thinking");
        } else if (event.type === "done") {
          if (!event.message || typeof event.message.content !== "string")
            throw new Error("Atlas returned an invalid final answer.");
          completed = true;
          setMessages((current) => sawTokens
            ? [...current.slice(0, -1), event.message]
            : [...current, event.message]);
        } else if (event.type === "error") {
          throw new Error(event.message || "Atlas could not complete this request.");
        }
      });
      if (!completed) throw new Error("Atlas stopped before returning a final answer.");
      if (controller.signal.aborted) return;
      setSelectedFile(null);
      setConnection("online");
      setModelStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (sawTokens && !completed)
        setMessages((current) => current.slice(0, -1));
      setNotice(
        error.message === "Failed to fetch"
          ? "Unable to reach Atlas. Check that the local backend is running, then try again."
          : error.message,
      );
      if (error.message === "Failed to fetch") setConnection("offline");
    } finally {
      if (requestRef.current === controller) {
        setPhase("idle");
        requestRef.current = null;
      }
    }
  }
  async function openConversation(id) {
    requestRef.current?.abort();
    try {
      const info = apiRef.current || await resolveBackend();
      const response = await fetch(`${info.baseUrl}/conversations/${id}`, {
        headers: backendHeaders(info.token),
      });
      if (!response.ok) throw new Error("Could not open this conversation.");
      const stored = await response.json();
      openedConversationRef.current = id;
      setActiveConversationId(id);
      setConversationTitles((current) => ({ ...current, [id]: stored.title }));
      setMessages(stored.messages || []);
      setSelectedFile(null);
      setPhase("idle");
      setNotice("");
      setView("Conversation");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function renameConversation(id, title) {
    const trimmed = title.trim();
    if (!trimmed) {
      setNotice("Conversation titles cannot be blank.");
      return;
    }
    if (trimmed.length > 120) {
      setNotice("Conversation titles must be 120 characters or fewer.");
      return;
    }
    try {
      await saveQueueRef.current.catch(() => {});
      const info = apiRef.current || await resolveBackend();
      const response = await fetch(`${info.baseUrl}/conversations/${id}`, {
        method: "PATCH",
        headers: backendHeaders(info.token, { "Content-Type": "application/json" }),
        body: JSON.stringify({ title: trimmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not rename this conversation.");
      setConversationTitles((current) => ({ ...current, [id]: trimmed }));
      setSavedConversations((current) => current.map((saved) => saved.id === id ? { ...saved, title: trimmed } : saved));
      setConversationSearchRevision((revision) => revision + 1);
      setEditingConversationId(null);
      setNotice("");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function deleteConversation(id) {
    try {
      await saveQueueRef.current.catch(() => {});
      const info = apiRef.current || await resolveBackend();
      const response = await fetch(`${info.baseUrl}/conversations/${id}`, {
        method: "DELETE",
        headers: backendHeaders(info.token),
      });
      if (!response.ok) throw new Error("Could not delete this conversation.");
      setSavedConversations((existing) => existing.filter((item) => item.id !== id));
      setConversationSearchResults((existing) => existing?.filter((item) => item.id !== id) ?? existing);
      if (activeConversationId === id) reset();
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function uploadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase("tool");
    setNotice("");
    setStarted(Date.now());
    const body = new FormData();
    body.append("file", file);
    try {
      const connectionInfo = apiRef.current || await resolveBackend();
      apiRef.current = connectionInfo;
      const response = await fetch(`${connectionInfo.baseUrl}/files`, {
        method: "POST",
        body,
        headers: backendHeaders(connectionInfo.token),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.detail || "The file could not be uploaded.");
      if (!controller.signal.aborted) {
        const uploaded = { path: result.path, filename: result.filename || result.path };
        await refreshWorkspaceFiles();
        setSelectedFile(uploaded);
        setInput((current) => current || "Summarize the attached file and cite useful sections.");
        setNotice(`Added ${uploaded.filename} to your workspace.`);
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error.message);
    } finally {
      if (requestRef.current === controller) {
        setPhase("idle");
        requestRef.current = null;
      }
    }
  }
  async function refreshWorkspaceFiles() {
    const info = apiRef.current || await resolveBackend();
    const response = await fetch(`${info.baseUrl}/files`, { headers: backendHeaders(info.token) });
    if (!response.ok) throw new Error("Could not refresh workspace files.");
    const data = await response.json();
    setFiles(data.files || []);
  }
  async function deleteWorkspaceFile(file) {
    if (!window.confirm(`Delete ${file.filename} from the Atlas workspace?`)) return;
    try {
      const info = apiRef.current || await resolveBackend();
      const response = await fetch(`${info.baseUrl}/files/${encodeURIComponent(file.path)}`, {
        method: "DELETE",
        headers: backendHeaders(info.token),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not delete this file.");
      setFiles((current) => current.filter((item) => item.path !== file.path));
      setSelectedFile((current) => current?.path === file.path ? null : current);
      setNotice(`Deleted ${file.filename} from your workspace.`);
    } catch (error) {
      setNotice(error.message);
    }
  }
  function toggleVoice() {
    if (listening) {
      speechRef.current?.stop();
      return;
    }
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice(
        "Voice input is not supported in this browser. You can type your message below.",
      );
      return;
    }
    setNotice("Voice input is provided by your browser; its speech service may process audio outside Atlas.");
    const recognition = new Recognition();
    speechRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.onresult = (e) =>
      setInput(
        Array.from(e.results)
          .map((r) => r[0].transcript)
          .join(" "),
      );
    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      setListening(false);
      setNotice(`Voice input: ${e.error}. You can still type your message.`);
    };
    try {
      recognition.start();
      setListening(true);
    } catch {
      setNotice("Could not start voice input. Please try again.");
    }
  }
  function selectPrompt(prompt) {
    setInput(prompt);
    inputRef.current?.focus();
  }
  function navigate(nextView) {
    setView(nextView);
    if (window.innerWidth <= 760) setSidebar(false);
  }

  return (
    <div
      className={`atlas-app phase-${listening ? "thinking" : phase} ${sidebar ? "" : "sidebar-closed"}`}
    >
      <div className="ambient-field" aria-hidden="true" />
      <aside className="sidebar" inert={!sidebar ? true : undefined}>
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-mark">
            <Icon name="atlas" size={28} />
          </span>
          <span>
            atlas<span className="brand-period">.</span>
          </span>
          <span className="version">{BUILD_VERSION}</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => navigate("Workspace")}
        >
          <span className="workspace-avatar">P</span>
          <span>
            Personal workspace<small>Your space to think</small>
          </span>
          <Icon name="chevrons" size={15} />
        </button>
        <button className="new-session" onClick={reset}>
          <Icon name="plus" size={17} />
          New session
          <Icon name="arrowUpRight" size={13} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ["Overview", "grid"],
            ["Conversation", "chat"],
            ["Memory", "memory"],
            ["Workspace", "folder"],
          ].map(([label, icon]) => (
            <button
              key={label}
              className={`nav-item ${view === label ? "selected" : ""}`}
              onClick={() => navigate(label)}
            >
              <Icon name={icon} size={18} />
              <span>
                {label === "Conversation"
                  ? "Conversations"
                  : label === "Workspace"
                    ? "Files & context"
                    : label}
              </span>
              {label === "Memory" && <span className="small-tag">LOCAL</span>}
              {view === label && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="nav-label recent-label">
          SAVED CONVERSATIONS
          <span>
            {savedConversations.length.toString()
              .padStart(2, "0")}
          </span>
        </div>
        <div className="session-list">
          <input
            className="conversation-search"
            type="search"
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
          />
          {savedConversations.length ? visibleConversations.length ? (
            visibleConversations.map((saved) => (
              <div className="saved-session" key={saved.id}>
                {editingConversationId === saved.id ? (
                  <form className="rename-session" onSubmit={(event) => { event.preventDefault(); renameConversation(saved.id, conversationTitleDraft); }}>
                    <input
                      autoFocus
                      aria-label={`New title for ${saved.title}`}
                      maxLength={120}
                      value={conversationTitleDraft}
                      onChange={(event) => setConversationTitleDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Escape") setEditingConversationId(null); }}
                    />
                    <button type="submit" aria-label={`Save title for ${saved.title}`}><Icon name="check" size={13} /></button>
                  </form>
                ) : (
                  <>
                    <button className="open-session" onClick={() => openConversation(saved.id)}>
                      <Icon name="chat" size={14} />
                      <span>{saved.title}</span>
                    </button>
                    <button className="rename-session-button" aria-label={`Rename ${saved.title}`} onClick={() => { setConversationTitleDraft(saved.title); setEditingConversationId(saved.id); }}>
                      <Icon name="edit" size={12} />
                    </button>
                    <button className="delete-session" aria-label={`Delete ${saved.title}`} onClick={() => deleteConversation(saved.id)}>
                      <Icon name="close" size={12} />
                    </button>
                  </>
                )}
              </div>
            ))
          ) : (
            <p>No conversations match “{conversationSearch}”.</p>
          ) : (
            <p>
              No saved conversations yet.
              <br />
              Your chats stay on this machine.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <Icon name="shield" size={18} />
            </span>
            <div>
              Local by design<small>Your model. Your machine.</small>
            </div>
            <span className="status-dot" />
          </div>
          <button className="profile" aria-label="Open system status" onClick={() => setTelemetry((v) => !v)}>
            <span className="profile-avatar">Y</span>
            <span>
              Your personal space<small>Make room for possibility</small>
            </span>
            <Icon name="activity" size={17} />
          </button>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button"
              aria-label="Toggle sidebar"
              aria-expanded={sidebar}
              onClick={() => setSidebar((v) => !v)}
            >
              <Icon name="panel" size={18} />
            </button>
            <span className="breadcrumb-divider" />
            <span>Personal workspace</span>
            <Icon name="chevron" size={13} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${connection}`}>
              <span className="status-dot" />
              {connection === "online"
                ? "Backend connected"
                : connection === "checking"
                  ? "Connecting"
                  : "Backend unavailable"}
            </span>
            <span className={`connection ${modelStatus === "ready" ? "online" : modelStatus === "checking" ? "checking" : "offline"}`}>
              <span className="status-dot" />
              {modelStatus === "ready"
                ? `Model ready: ${modelName}`
                : modelStatus === "missing"
                  ? `Run ollama pull ${modelName}`
                  : modelStatus === "checking"
                    ? "Checking model"
                    : "Start Ollama to chat"}
            </span>
            <label className="model-picker">
              <span>Model</span>
              <select
                aria-label="Local model"
                value={activeModel}
                disabled={!installedModels.length || busy}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedModel(next === modelName ? "" : next);
                  try {
                    if (next === modelName) window.localStorage.removeItem("atlas.selectedModel");
                    else window.localStorage.setItem("atlas.selectedModel", next);
                  } catch { /* Model choice remains available until the app closes. */ }
                }}
              >
                {installedModels.length ? installedModels.map((model) => (
                  <option key={model} value={model}>{model}</option>
                )) : <option value={activeModel}>{modelStatus === "unavailable" ? `${activeModel} · Ollama unavailable` : activeModel}</option>}
              </select>
            </label>
            <button
              className={`icon-button ${telemetry ? "active" : ""}`}
              onClick={() => setTelemetry((v) => !v)}
              aria-label="Toggle system telemetry"
              aria-expanded={telemetry}
            >
              <Icon name="activity" size={19} />
            </button>
          </div>
        </header>
        <div className="main-scroll" ref={feedRef}>
          {view === "Overview" ? (
            <div className="home-content">
              <div className="home-eyebrow">
                <span className="tiny-spark">✦</span>A SPACE FOR YOUR NEXT BIG
                THING
              </div>
              <section className="hero">
                <div className="hero-copy">
                  <div className="greeting">YOU + ATLAS</div>
                  <h1>
                    Big ideas.
                    <br />
                    <span>Infinite possibilities.</span>
                  </h1>
                  <p>
                    A thinking partner. A helping hand.
                    <br />A little more space for what matters.
                  </p>
                  <div className="ready-label">
                    <span className="status-dot" />
                    Ready when you are
                    <span className="short-line" />
                    <span>Just start a conversation</span>
                  </div>
                </div>
                <div className="hero-art">
                  <LiquidCore />
                  <span className="orb-caption">
                    <span />
                    INTELLIGENCE, IN YOUR ORBIT
                  </span>
                </div>
              </section>
              <section className="start-section">
                <div className="section-heading">
                  <h2>Where shall we begin?</h2>
                  <span>A spark is all it takes</span>
                </div>
                <div className="suggestions">
                  {suggestions.map((item) => (
                    <button
                      className={`suggestion glass ${item.color}`}
                      key={item.title}
                      onClick={() => selectPrompt(item.prompt)}
                    >
                      <span className="suggestion-icon">
                        <Icon name={item.icon} size={21} />
                      </span>
                      <Icon
                        name="arrowUpRight"
                        size={17}
                        className="suggestion-arrow"
                      />
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </button>
                  ))}
                </div>
              </section>
              <section className="possibilities">
                <div className="section-heading">
                  <h2>A little more than a conversation</h2>
                  <span className="preview-label">MEET YOUR WORKSPACE</span>
                </div>
                <button
                  className="feature-card glass"
                  onClick={() => {
                    if (!busy) {
                      setPreview(true);
                      setView("Conversation");
                    }
                  }}
                  disabled={busy}
                >
                  <div className="feature-art">
                    <span className="orbit-ring" />
                    <span className="orbit-ring second" />
                    <span className="feature-core">
                      <Icon name="layers" size={25} />
                    </span>
                    <span className="satellite one">
                      <Icon name="code" size={13} />
                    </span>
                    <span className="satellite two">
                      <Icon name="globe" size={13} />
                    </span>
                  </div>
                  <div className="feature-copy">
                    <span className="feature-kicker">
                      ONE THOUGHT. MANY POSSIBILITIES.
                    </span>
                    <h3>Watch an idea come to life.</h3>
                    <p>
                      Thinking, exploring, creating — all in one fluid space.
                    </p>
                    <span className="feature-cta">
                      Explore an example <Icon name="arrowRight" size={15} />
                    </span>
                  </div>
                  <span className="feature-badge">
                    <span className="status-dot" />
                    INTERACTIVE PREVIEW
                  </span>
                </button>
              </section>
              <div className="home-footnote">
                <Icon name="lock" size={12} />
                Powered by your local model. Built around you.
              </div>
            </div>
          ) : view === "Conversation" ? (
            <div className="conversation-content">
              <div className="page-heading">
                <div className="greeting">YOUR THINKING SPACE</div>
                <h1>
                  {preview ? "An idea, in motion." : "Let’s think it through."}
                </h1>
                <p>
                  {preview
                    ? "An interactive example of Atlas at work. No files are changed."
                    : "A little curiosity can go a long way."}
                </p>
              </div>
              {preview ? (
                <>
                  <div className="preview-banner">
                    <Icon name="spark" size={15} />
                    Workspace preview<span>SIMULATED ACTIVITY</span>
                  </div>
                  <Message
                    message={{
                      role: "user",
                      content:
                        "Help me bring a little structure to my next big idea.",
                    }}
                  />
          <ExecutionCard
                    title="Thinking through your workspace"
                    subtitle="Planning · Context and structure"
                    status={previewStep > 0 ? "complete" : "running"}
                    logs={[
                      "Considering the goal: a simpler creative workspace.",
                      "Identified three useful stages for your ideas.",
                    ]}
                  />
                  <ExecutionCard
                    title="Preparing a starting point"
                    subtitle="Workspace agent · Example file"
                    status={
                      previewStep > 1
                        ? "complete"
                        : previewStep === 1
                          ? "running"
                          : "waiting"
                    }
                    logs={[
                      "Preview only: no files written.",
                      "Prepared workspace.js with three project stages.",
                    ]}
                  />
                  {previewContent && (
                    <Message
                      message={{ role: "assistant", content: previewContent }}
                      streaming={phase === "streaming"}
                      runLabel="Preview output"
                      onRun={() =>
                        setNotice(
                          'Example output: { ideas: [], inProgress: ["Something extraordinary"], readyToShare: [] }',
                        )
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  {messages.length === 0 && (
                    <div className="empty-conversation glass">
                      <Icon name="spark" size={28} />
                      <h2>Good things start with a question.</h2>
                      <p>
                        Ask Atlas to explore an idea, untangle a problem, or
                        plan your next step.
                      </p>
                    </div>
                  )}
                  {messages.map((message, i) => (
                    <Message
                      key={i}
                      message={message}
                      streaming={phase === "streaming" && i === messages.length - 1 && message.role === "assistant"}
                      onRun={(code) =>
                        selectPrompt(
                          `Review this code and explain how to run it safely in my environment:\n\n${code}`,
                        )
                      }
                    />
                  ))}
                  {busy && (
                    <ExecutionCard
                      title={
                        phase === "tool"
                          ? toolActivity || "Adding your file to the workspace"
                          : "Atlas is thinking"
                      }
                      subtitle={
                        phase === "tool"
                          ? toolActivity ? "Agent tool · Running" : "File I/O · Uploading"
                          : "Local model · Waiting for response"
                      }
                      status="running"
                      started={started}
                      logs={[
                        "Request sent to the local Atlas backend.",
                        toolActivity ? `Tool activity: ${toolActivity}` : "Waiting for Atlas to respond.",
                      ]}
                    />
                  )}
                </>
              )}
            </div>
          ) : view === "Memory" ? (
            <MemoryLibrary enabled={contextFeatures.memory} connection={connection} />
          ) : (
            <div className="library-content">
              <div className="page-heading">
                <div className="greeting">
                  {view === "Memory"
                    ? "A LITTLE CONTEXT GOES A LONG WAY"
                    : "ROOM FOR YOUR IDEAS"}
                </div>
                <h1>
                  {view === "Memory"
                    ? "Keep the important things close."
                    : "Your files. A shared perspective."}
                </h1>
                <p>
                  {view === "Memory"
                    ? "Atlas can save and recall context using its local memory tools."
                    : "Files in your local workspace stay available across sessions. Choose one to attach it to a conversation."}
                </p>
              </div>
              <div className="library-card glass">
                <Icon
                  name={view === "Memory" ? "memory" : "folder"}
                  size={30}
                />
                <h2>
                  {view === "Memory"
                    ? "Pick up where you left off"
                    : "A little context changes everything"}
                </h2>
                <p>
                  {view === "Memory"
                    ? contextFeatures.memory
                      ? "Bring saved preferences, project notes, and useful facts into the conversation."
                      : "Memory is disabled in the current configuration."
                    : "Your workspace files are stored on this machine and remain available when you return."}
                </p>
                <button
                  className="primary-button"
                  disabled={busy || (view === "Memory" && !contextFeatures.memory) || (view === "Workspace" && !contextFeatures.files)}
                  onClick={() =>
                    view === "Memory"
                      ? sendMessage(
                          "Recall and summarize my saved memories. If none exist, tell me.",
                        )
                      : fileRef.current?.click()
                  }
                >
                  <Icon name={view === "Memory" ? "spark" : "plus"} size={16} />
                  {view === "Memory" ? "Recall my memories" : "Add a file"}
                </button>
                {view === "Workspace" && (
                  <div className="file-list">
                    <div className="nav-label">FILES IN THIS WORKSPACE</div>
                    {files.length === 0 && <p className="empty-file-list">No supported files in this workspace yet.</p>}
                    {files.map((file) => (
                      <div className="workspace-file" key={file.path}>
                        <button
                          className="workspace-file-open"
                          onClick={() => {
                            setSelectedFile(file);
                            selectPrompt("Summarize the attached file and cite useful sections.");
                          }}
                        >
                          <Icon name="file" size={17} />
                          <span>{file.filename}<small>{formatFileSize(file.size_bytes)} · {file.readable ? formatFileDate(file.modified_at) : "Too large to attach"}</small></span>
                          <Icon name="arrowUpRight" size={15} />
                        </button>
                        <button className="workspace-file-delete" aria-label={`Delete ${file.filename}`} onClick={() => deleteWorkspaceFile(file)}>
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="dock-area">
          {notice && (
            <div className="notice" role="status">
              <Icon name="info" size={16} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <div className="context-bar">
            <span className="context-label">IN YOUR ORBIT</span>
            <button
              className={
                context.research ? "context-chip enabled" : "context-chip"
              }
              aria-pressed={context.research}
              onClick={() =>
                setContext((c) => ({ ...c, research: !c.research }))
              }
              disabled={!contextFeatures.web_research}
            >
              <Icon name="globe" size={13} />
              Web research
              <Icon name={context.research ? "check" : "plus"} size={12} />
            </button>
            <button
              className={
                context.memory ? "context-chip enabled" : "context-chip"
              }
              aria-pressed={context.memory}
              onClick={() => setContext((c) => ({ ...c, memory: !c.memory }))}
              disabled={!contextFeatures.memory}
            >
              <Icon name="memory" size={13} />
              Memory
              <Icon name={context.memory ? "check" : "plus"} size={12} />
            </button>
            <button
              className="context-chip local-context"
              onClick={() => setTelemetry(true)}
            >
              <Icon name="shield" size={13} />
              Local workspace
            </button>
          </div>
          {selectedFile && (
            <div className="selected-file">
              <Icon name="file" size={14} />
              <span>Attached: {selectedFile.filename}</span>
              <button type="button" aria-label="Remove attached file" onClick={() => setSelectedFile(null)}><Icon name="close" size={12} /></button>
            </div>
          )}
          <form
            className={`luminary-dock ${listening ? "listening" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
          >
            <button
              type="button"
              className="dock-add"
              aria-label="Add a file to the workspace"
              disabled={busy || !contextFeatures.files}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="plus" size={21} />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder={
                listening
                  ? "Listening to your ideas…"
                  : busy
                    ? "A little thinking in progress…"
                    : "What’s on your mind?"
              }
              aria-label="Message Atlas"
            />
            <div className="dock-tools">
              <Waveform active={busy || listening} />
              <button
                type="button"
                className={`icon-button microphone ${listening ? "active" : ""}`}
                aria-label={
                  listening ? "Stop voice input" : "Start voice input"
                }
                onClick={toggleVoice}
                disabled={busy}
              >
                <Icon name="mic" size={18} />
              </button>
              {busy ? (
                <button
                  className="send-button"
                  type="button"
                  aria-label="Stop response"
                  onClick={() => {
                    requestRef.current?.abort();
                    requestRef.current = null;
                    setPreview(false);
                    setPhase("idle");
                    setNotice(
                      "Response stopped. Any server-side work may still finish.",
                    );
                  }}
                >
                  <Icon name="stop" size={16} />
                </button>
              ) : (
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send message"
                  disabled={!input.trim()}
                >
                  <Icon name="arrowUp" size={19} />
                </button>
              )}
            </div>
          </form>
          <div className="dock-caption">
            <span>
              <span className="mini-orb" />
              ATLAS<span className="caption-divider">/</span>
              {listening
                ? "Listening"
                : phase === "thinking"
                  ? "Thinking it through"
                  : phase === "tool"
                    ? "Working on it"
                    : phase === "streaming"
                      ? "Bringing it together"
                      : "A little intelligence. A lot of possibility."}
            </span>
            <span>
              <kbd>Ctrl K</kbd> to focus
            </span>
          </div>
        </div>
        <input
          type="file"
          hidden
          ref={fileRef}
          onChange={uploadFile}
          accept=".txt,.md,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.htm,.css,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.c,.h,.cpp,.hpp,.sh,.ps1,.toml,.ini,.log,.sql,.env,.diff,.patch,.pdf,.docx,.png,.jpg,.jpeg"
          aria-label="Choose a file"
        />
      </main>
      {telemetry && (
        <Telemetry
          connection={connection}
          modelStatus={modelStatus}
          modelName={modelName}
          phase={phase}
          messages={messages.length}
          files={files}
          hardware={telemetryData}
          onClose={() => setTelemetry(false)}
        />
      )}
    </div>
  );
}
