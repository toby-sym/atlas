import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
const paths = {
  atlas: "M3 20 11 4h2l8 16M7 14h10M10 20l2-4 2 4",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  chevrons: "m9 8 3-3 3 3m-6 8 3 3 3-3",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  chat: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4H13a8 8 0 0 1 8 7.5ZM7 10h10M7 14h6",
  memory:
    "M12 3c-5 0-8 2-8 4s3 4 8 4 8-2 8-4-3-4-8-4ZM4 7v10c0 2 3 4 8 4s8-2 8-4V7M4 12c0 2 3 4 8 4s8-2 8-4",
  folder: "M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h7v3",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM8 12l3 3 5-6",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 4-3 1-1 4H9l-1-4-3-1-2-4 2-5 3-1zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  panel: "M3 4h18v16H3zM9 4v16M5.5 8h1M5.5 12h1",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  arrowUpRight: "M6 18 18 6M6 6h12v12",
  arrowRight: "M4 12h16m-6-6 6 6-6 6",
  arrowUp: "M12 20V4m-6 6 6-6 6 6",
  layers: "m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6",
  lock: "M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  file: "M5 3h9l5 5v13H5zM14 3v6h5M8 13h8M8 17h5",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  stop: "M6 6h12v12H6z",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  play: "m7 4 14 8-14 8z",
  diff: "M8 3v18M4 7l4-4 4 4M16 3v18m-4-4 4 4 4-4",
  terminal: "m4 6 6 6-6 6M12 18h8",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7v1",
  cpu: "M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4",
};
export function Icon({ name, size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
export function LiquidCore() {
  return (
    <div className="liquid-core" aria-hidden="true">
      <div className="orb-halo" />
      <div className="orb-track track-one" />
      <div className="orb-track track-two" />
      <div className="orb-body">
        <div className="orb-fluid fluid-one" />
        <div className="orb-fluid fluid-two" />
        <div className="orb-fluid fluid-three" />
        <div className="orb-depth" />
        <div className="orb-shine" />
        <div className="orb-latitude" />
      </div>
      <span className="star star-one" />
      <span className="star star-two" />
      <span className="star star-three" />
    </div>
  );
}
export function Waveform({ active }) {
  return (
    <svg
      className={`waveform ${active ? "active" : ""}`}
      width="68"
      height="30"
      viewBox="0 0 68 30"
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d="M1 15C7 15 7 9 12 9S17 23 22 23 26 4 32 4 38 27 43 27 48 8 53 8 59 15 67 15"
          fill="none"
          stroke={["#a796fa", "#79b8ec", "#c9a9f6"][i]}
          strokeWidth="1.15"
          style={{ animationDelay: `${i * -0.65}s`, opacity: 0.7 - i * 0.18 }}
        />
      ))}
    </svg>
  );
}
export function ExecutionCard({ title, subtitle, status, logs, started }) {
  const [open, setOpen] = useState(false),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (status !== "running") return;
    const start = started || Date.now();
    const timer = setInterval(
      () => setElapsed((Date.now() - start) / 1000),
      100,
    );
    return () => clearInterval(timer);
  }, [status, started]);
  return (
    <div className={`execution-card glass ${status}`}>
      <button
        className="execution-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="execution-icon">
          <Icon name={status === "complete" ? "check" : "terminal"} size={18} />
        </span>
        <span className="execution-name">
          {title}
          <small>{subtitle}</small>
        </span>
        <span className="execution-time">
          {status === "waiting" ? "QUEUED" : `${elapsed.toFixed(1)}s`}
        </span>
        <span className={`execution-state ${status}`}>
          {status === "running"
            ? "Working"
            : status === "complete"
              ? "Complete"
              : "Waiting"}
        </span>
        <Icon
          name="chevron"
          size={15}
          className={open ? "expanded-chevron" : ""}
        />
      </button>
      {open && (
        <div className="execution-logs">
          {logs.map((log, i) => (
            <div key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function Highlight({ code }) {
  return code
    .split(
      /("[^"\n]*"|'[^'\n]*'|\b(?:const|let|var|return|function|import|from|export|async|await|if|else|def|class|True|False|None)\b|\/\/[^\n]*|\b\d+\b)/g,
    )
    .map((part, i) => (
      <span
        key={i}
        className={
          /^['"]/.test(part)
            ? "syntax-string"
            : /^(const|let|var|return|function|import|from|export|async|await|if|else|def|class|True|False|None)$/.test(
                  part,
                )
              ? "syntax-keyword"
              : /^\/\//.test(part)
                ? "syntax-comment"
                : /^\d+$/.test(part)
                  ? "syntax-number"
                  : ""
        }
      >
        {part}
      </span>
    ));
}
function CodeBlock({ code, language, onRun, actionLabel }) {
  const [copied, setCopied] = useState(false),
    [diff, setDiff] = useState(false),
    [copyError, setCopyError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="code-container">
      <div className="code-toolbar">
        <span>
          <Icon name="code" size={14} />
          {language || "code"}
        </span>
        <div>
          <button
            onClick={() => setDiff((v) => !v)}
            aria-pressed={diff}
            title="Compare with empty file"
          >
            <Icon name="diff" size={13} />
            {diff ? "Code" : "Diff"}
          </button>
          <button onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={13} />
            {copyError ? "Copy failed" : copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={() => onRun?.(code)}
            title="Prepare a request for Atlas to explain how to run this code safely"
          >
            <Icon name="play" size={12} />
            {actionLabel}
          </button>
        </div>
      </div>
      {diff && (
        <div className="diff-label">
          New snippet · compared with an empty file
        </div>
      )}
      <pre className={diff ? "diff-code" : ""}>
        <code>
          {diff ? (
            code.split("\n").map((line, i) => (
              <div key={i}>
                <span className="diff-plus">+</span>
                <Highlight code={line} />
              </div>
            ))
          ) : (
            <Highlight code={code} />
          )}
        </code>
      </pre>
    </div>
  );
}
export function Message({ message, streaming, onRun, runLabel = "Ask Atlas" }) {
  return (
    <article
      className={`message-card ${message.role === "user" ? "user-message" : "assistant-message glass"} ${streaming ? "streaming" : ""}`}
    >
      <div className="message-author">
        {message.role === "user" ? (
          <span className="user-avatar">Y</span>
        ) : (
          <span className="assistant-avatar">
            <Icon name="atlas" size={18} />
          </span>
        )}
        <span>
          {message.role === "user" ? "You" : "Atlas"}
          {message.role !== "user" && <small>YOUR THINKING PARTNER</small>}
        </span>
        {streaming && <span className="stream-label">COMPOSING</span>}
      </div>
      <div className="markdown-content">
        <ReactMarkdown
          components={{
            pre: ({ children }) => <>{children}</>,
            code: ({ className, children }) => {
              const content = String(children).replace(/\n$/, "");
              return className || String(children).includes("\n") ? (
                <CodeBlock
                  code={content}
                  language={className?.replace("language-", "")}
                  onRun={onRun}
                  actionLabel={runLabel}
                />
              ) : (
                <code>{children}</code>
              );
            },
            a: ({ children, node, ...props }) => (
              <a {...props} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        >
          {message.content || ""}
        </ReactMarkdown>
      </div>
    </article>
  );
}
export function Telemetry({ connection, modelStatus, modelName, phase, messages, files, hardware, onClose }) {
  return (
    <aside className="telemetry glass" aria-label="System telemetry">
      <div className="telemetry-heading">
        <span>
          <Icon name="activity" size={17} />
          System pulse
        </span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close telemetry"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="telemetry-section">
        <div className="nav-label">LOCAL CONNECTION</div>
        <div className="telemetry-value">
          <span
            className={`status-dot ${connection === "online" ? "" : "muted"}`}
          />
          {connection === "online"
            ? "Backend connected"
            : connection === "checking"
              ? "Checking connection"
              : "Backend unavailable"}
        </div>
        <p>Atlas connects to the model running on your machine.</p>
        <div className="metric">
          <span>Configured model</span>
          <strong>{modelStatus === "ready" ? modelName : modelStatus}</strong>
        </div>
      </div>
      <div className="telemetry-section">
        <div className="nav-label">CURRENT ACTIVITY</div>
        <div className="telemetry-value">
          <Waveform active={phase !== "idle"} />
          {phase === "idle" ? "Standing by" : phase}
        </div>
        <div className="metric">
          <span>Messages in conversation</span>
          <strong>{messages}</strong>
        </div>
        <div className="metric">
          <span>Files added</span>
          <strong>{files.length}</strong>
        </div>
      </div>
      <div className="telemetry-section">
        <div className="nav-label">HARDWARE</div>
        <div className="metric">
          <span>
            <Icon name="cpu" size={14} />
            CPU utilization
          </span>
          <strong>{hardware?.available ? `${hardware.cpu_percent}%` : "Unavailable"}</strong>
        </div>
        <div className="meter"><span style={{ width: `${hardware?.cpu_percent || 0}%` }} /></div>
        <div className="metric">
          <span>System memory</span>
          <strong>{hardware?.available ? `${hardware.memory_used_gb} / ${hardware.memory_total_gb} GB` : "Unavailable"}</strong>
        </div>
        <div className="meter"><span style={{ width: `${hardware?.memory_percent || 0}%` }} /></div>
        <div className="metric">
          <span>Atlas backend memory</span>
          <strong>{hardware?.available ? `${hardware.backend_rss_mb} MB` : "Unavailable"}</strong>
        </div>
        <p>GPU and VRAM readings are not available.</p>
      </div>
      <div className="telemetry-section">
        <div className="nav-label">WORKSPACE TREE</div>
        <div className="tree-root">
          <Icon name="folder" size={15} />
          workspace/
        </div>
        {files.length ? (
          files.map((file) => (
            <div className="tree-file" key={file.path}>
              <Icon name="file" size={13} />
              {file.filename}
            </div>
          ))
        ) : (
          <p>Files you add this session will appear here.</p>
        )}
      </div>
      <div className="telemetry-footer">
        <Icon name="shield" size={14} />
        Your local intelligence, at a glance.
      </div>
    </aside>
  );
}
