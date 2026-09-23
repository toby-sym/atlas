import { useEffect, useRef, useState } from "react";
import {
  Icon,
  LiquidCore,
  Waveform,
  ExecutionCard,
  Message,
  Telemetry,
} from "./components/SpatialUI";
import "./App.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
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

export default function App() {
  const [view, setView] = useState("Overview");
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 760);
  const [telemetry, setTelemetry] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [connection, setConnection] = useState("checking");
  const [notice, setNotice] = useState("");
  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(false);
  const [previewStep, setPreviewStep] = useState(0);
  const [previewContent, setPreviewContent] = useState("");
  const [context, setContext] = useState({ research: false, memory: false });
  const [listening, setListening] = useState(false);
  const [started, setStarted] = useState(null);
  const inputRef = useRef(null),
    fileRef = useRef(null),
    feedRef = useRef(null),
    requestRef = useRef(null),
    speechRef = useRef(null);
  const busy = phase !== "idle";

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/health`, { signal: controller.signal })
      .then((r) => setConnection(r.ok ? "online" : "offline"))
      .catch(() => {
        if (!controller.signal.aborted) setConnection("offline");
      });
    return () => {
      controller.abort();
      requestRef.current?.abort();
      speechRef.current?.abort();
    };
  }, []);
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
    setPhase("idle");
    setInput("");
    setNotice("");
    setView("Overview");
    if (window.innerWidth <= 760) setSidebar(false);
  }
  async function sendMessage(text) {
    if (!text.trim() || busy) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const history = [...messages, { role: "user", content: text.trim() }];
    setPreview(false);
    setMessages(history);
    setView("Conversation");
    setInput("");
    setNotice("");
    setPhase("thinking");
    setStarted(Date.now());
    const instructions = [
      context.research && "Use web search and cite sources.",
      context.memory && "Recall relevant saved memory before answering.",
    ]
      .filter(Boolean)
      .join(" ");
    const payload = history.map((m) => ({ role: m.role, content: m.content }));
    if (instructions)
      payload[payload.length - 1] = {
        role: "user",
        content: `${text.trim()}\n\n${instructions}`,
      };
    try {
      const response = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.detail || "Atlas could not complete this request.",
        );
      if (controller.signal.aborted) return;
      setMessages((current) => [
        ...current,
        data.message || {
          role: "assistant",
          content: "No response was returned. Please try again.",
        },
      ]);
      setConnection("online");
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice(
        error.message === "Failed to fetch"
          ? "Unable to reach Atlas. Start the local backend on port 8000, then try again."
          : error.message,
      );
      setConnection("offline");
    } finally {
      if (requestRef.current === controller) {
        setPhase("idle");
        requestRef.current = null;
      }
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
      const response = await fetch(`${API}/files`, {
        method: "POST",
        body,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.detail || "The file could not be uploaded.");
      if (!controller.signal.aborted) {
        setFiles((current) => [...current, result.path]);
        setNotice(`Added ${result.path} to your workspace.`);
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
          <span className="version">BETA</span>
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
          THIS SESSION
          <span>
            {messages
              .filter((m) => m.role === "user")
              .length.toString()
              .padStart(2, "0")}
          </span>
        </div>
        <div className="session-list">
          {messages.length ? (
            messages
              .filter((m) => m.role === "user")
              .slice(-4)
              .map((m, i) => (
                <button key={i} onClick={() => navigate("Conversation")}>
                  <Icon name="chat" size={14} />
                  <span>{m.content}</span>
                </button>
              ))
          ) : (
            <p>
              A fresh canvas.
              <br />
              See where your ideas take you.
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
          <button className="profile" onClick={() => setTelemetry((v) => !v)}>
            <span className="profile-avatar">Y</span>
            <span>
              Your personal space<small>Make room for possibility</small>
            </span>
            <Icon name="settings" size={17} />
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
                ? "System connected"
                : connection === "checking"
                  ? "Connecting"
                  : "Local mode"}
            </span>
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
                          ? "Adding your file to the workspace"
                          : "Atlas is thinking"
                      }
                      subtitle={
                        phase === "tool"
                          ? "File I/O · Uploading"
                          : "Local model · Waiting for response"
                      }
                      status="running"
                      started={started}
                      logs={[
                        "Request sent to the local Atlas backend.",
                        "Waiting for the backend to finish. Tool-level events are not available.",
                      ]}
                    />
                  )}
                </>
              )}
            </div>
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
                    : "Add a file to your local workspace, then ask Atlas to explore it."}
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
                    ? "Bring saved preferences, project notes, and useful facts into the conversation."
                    : "Files added here are saved to the Atlas workspace on your machine."}
                </p>
                <button
                  className="primary-button"
                  disabled={busy}
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
                {files.length > 0 && view === "Workspace" && (
                  <div className="file-list">
                    <div className="nav-label">ADDED THIS SESSION</div>
                    {files.map((file) => (
                      <button
                        key={file}
                        onClick={() =>
                          selectPrompt(
                            `Read the file ${file} and summarize its contents.`,
                          )
                        }
                      >
                        <Icon name="file" size={17} />
                        {file}
                        <Icon name="arrowUpRight" size={15} />
                      </button>
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
              disabled={busy}
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
          aria-label="Choose a file"
        />
      </main>
      {telemetry && (
        <Telemetry
          connection={connection}
          phase={phase}
          messages={messages.length}
          files={files}
          onClose={() => setTelemetry(false)}
        />
      )}
    </div>
  );
}
