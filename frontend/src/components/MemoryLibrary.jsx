import { useEffect, useMemo, useState } from "react";
import { backendHeaders, resolveBackend } from "../backendClient";
import { Icon } from "./SpatialUI";

const emptyForm = { key: "", category: "general", value: "", scope: "project" };

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let result = {};
  try {
    result = await response.json();
  } catch {
    // Use the status-specific message below when the response has no JSON body.
  }
  if (!response.ok) throw new Error(result.detail || "The memory could not be saved.");
  return result;
}

function MemoryForm({ initial, busy, onCancel, onSubmit, projectName }) {
  const [form, setForm] = useState(() => ({ ...initial }));

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({
      key: form.key.trim(),
      category: form.category.trim() || "general",
      value: form.value,
      scope: form.scope || "project",
    });
  }

  return (
    <form className="memory-form" onSubmit={submit}>
      <label className="memory-field">
        <span>Name</span>
        <input
          value={form.key}
          maxLength={200}
          onChange={(event) => change("key", event.target.value)}
          placeholder="For example, preferred writing style"
          required
        />
      </label>
      <label className="memory-field">
        <span>Category</span>
        <input
          value={form.category}
          maxLength={64}
          onChange={(event) => change("category", event.target.value)}
          placeholder="general"
          required
        />
      </label>
      <label className="memory-field">
        <span>Visible in</span>
        <select
          value={form.scope || "project"}
          onChange={(event) => change("scope", event.target.value)}
          disabled={busy}
        >
          <option value="project">{projectName}</option>
          <option value="shared">Personal · shared across projects</option>
        </select>
      </label>
      <label className="memory-field memory-value-field">
        <span>Details</span>
        <textarea
          value={form.value}
          maxLength={10000}
          onChange={(event) => change("value", event.target.value)}
          placeholder="What should Atlas remember?"
          rows={4}
          required
        />
      </label>
      <div className="memory-form-actions">
        <button className="primary-button" type="submit" disabled={busy}>
          <Icon name="check" size={15} />
          {busy ? "Saving…" : "Save memory"}
        </button>
        <button className="memory-text-button" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function updatedLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved locally" : `Updated ${date.toLocaleString()}`;
}

export default function MemoryLibrary({ enabled, connection, projectId, projectName, onOpenConversation }) {
  const [api, setApi] = useState(null);
  const [memories, setMemories] = useState([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || connection !== "online") return undefined;
    const controller = new AbortController();
    let current = true;
    setMemories([]);
    setSearch("");
    setCreating(false);
    setEditingId(null);
    setDeletingId(null);
    setLoading(true);
    setLoadError("");

    async function loadMemories() {
      try {
        const info = await resolveBackend();
        if (!current) return;
        setApi(info);
        const result = await requestJson(`${info.baseUrl}/memories?project_id=${encodeURIComponent(projectId)}`, {
          headers: backendHeaders(info.token),
          signal: controller.signal,
        });
        if (current) setMemories(result.memories || []);
      } catch (loadError) {
        if (current && !controller.signal.aborted) setLoadError(loadError.message);
      } finally {
        if (current) setLoading(false);
      }
    }

    loadMemories();
    return () => {
      current = false;
      controller.abort();
    };
  }, [enabled, connection, loadAttempt, projectId]);

  const visibleMemories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return memories;
    return memories.filter((memory) =>
      [memory.key, memory.category, memory.value]
        .some((field) => String(field || "").toLocaleLowerCase().includes(query)),
    );
  }, [memories, search]);

  async function saveMemory(memoryId, values) {
    if (!api) return;
    setBusy(true);
    setError("");
    try {
      const creatingMemory = memoryId === null;
      const result = await requestJson(
        creatingMemory
          ? `${api.baseUrl}/memories?project_id=${encodeURIComponent(projectId)}`
          : `${api.baseUrl}/memories/${memoryId}?project_id=${encodeURIComponent(projectId)}`,
        {
          method: creatingMemory ? "POST" : "PUT",
          headers: backendHeaders(api.token, { "Content-Type": "application/json" }),
          body: JSON.stringify(values),
        },
      );
      const saved = result.memory;
      setMemories((current) => [
        saved,
        ...current.filter((memory) => memory.id !== saved.id),
      ]);
      setCreating(false);
      setEditingId(null);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(memoryId) {
    if (!api) return;
    setBusy(true);
    setError("");
    try {
      await requestJson(`${api.baseUrl}/memories/${memoryId}?project_id=${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        headers: backendHeaders(api.token),
      });
      setMemories((current) => current.filter((memory) => memory.id !== memoryId));
      setDeletingId(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="memory-library">
      <div className="page-heading">
        <div className="greeting">A LITTLE CONTEXT GOES A LONG WAY</div>
        <h1>Keep the important things close.</h1>
        <p>Project memories stay in {projectName}. Personal memories are shared with your other projects.</p>
      </div>

      {!enabled ? (
        <div className="library-card glass memory-empty-state">
          <Icon name="memory" size={30} />
          <h2>Memory is turned off</h2>
          <p>Enable memory in the Atlas configuration to use this library.</p>
        </div>
      ) : connection !== "online" ? (
        <div className="library-card glass memory-empty-state">
          <Icon name="memory" size={30} />
          <h2>Connect to Atlas to open your memories</h2>
          <p>Your saved memories will appear here when the local backend is available.</p>
        </div>
      ) : (
        <>
          <div className="memory-toolbar">
            <label className="memory-search">
              <Icon name="search" size={16} />
              <span className="visually-hidden">Search memories</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search names, categories, and details"
              />
            </label>
            <button
              className="primary-button"
              type="button"
              disabled={busy || !api}
              onClick={() => {
                setCreating((value) => !value);
                setEditingId(null);
                setError("");
              }}
            >
              <Icon name="plus" size={16} />
              Add memory
            </button>
          </div>

          {error && <p className="memory-error" role="alert">{error}</p>}

          {creating && (
            <section className="memory-card glass" aria-label="New memory">
              <MemoryForm
                initial={emptyForm}
                busy={busy}
                projectName={projectName}
                onCancel={() => setCreating(false)}
                onSubmit={(values) => saveMemory(null, values)}
              />
            </section>
          )}

          <div className="memory-list" aria-live="polite">
            {loadError ? (
              <div className="library-card glass memory-empty-state">
                <Icon name="info" size={25} />
                <h2>Could not load your memories</h2>
                <p>{loadError}</p>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                >
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div className="library-card glass memory-empty-state">
                <Icon name="activity" size={25} />
                <h2>Loading your memories</h2>
              </div>
            ) : visibleMemories.length ? (
              visibleMemories.map((memory) => (
                <article className="memory-card glass" key={memory.id}>
                  {editingId === memory.id ? (
                    <MemoryForm
                      initial={{
                        key: memory.key,
                        category: memory.category || "general",
                        value: memory.value,
                        scope: memory.project_id === "shared" ? "shared" : "project",
                      }}
                      busy={busy}
                      projectName={projectName}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(values) => saveMemory(memory.id, values)}
                    />
                  ) : (
                    <>
                      <div className="memory-card-heading">
                        <div>
                          <span className="memory-category">{memory.category || "general"}</span>
                          <span className="memory-scope">{memory.project_id === "shared" ? "Personal · shared" : projectName}</span>
                          <h2>{memory.key}</h2>
                          <time>{updatedLabel(memory.updated_at)}</time>
                        </div>
                        <div className="memory-card-actions">
                          {deletingId === memory.id ? (
                            <>
                              <span>Delete this memory?</span>
                              <button type="button" onClick={() => deleteMemory(memory.id)} disabled={busy}>
                                Delete
                              </button>
                              <button type="button" onClick={() => setDeletingId(null)} disabled={busy}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setEditingId(memory.id);
                                  setCreating(false);
                                  setDeletingId(null);
                                  setError("");
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                aria-label={`Delete ${memory.key}`}
                                disabled={busy}
                                onClick={() => setDeletingId(memory.id)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="memory-details">{memory.value}</p>
                      <div className="memory-source-row">
                        <span>{memory.source === "chat" ? "Saved from a conversation" : "Added in the memory library"}</span>
                        {memory.source_conversation_id && (
                          <button type="button" onClick={() => onOpenConversation(memory.source_conversation_id)}>
                            Open conversation
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </article>
              ))
            ) : (
              <div className="library-card glass memory-empty-state">
                <Icon name={search ? "search" : "memory"} size={30} />
                <h2>{search ? "No matching memories" : "No memories saved yet"}</h2>
                <p>
                  {search
                    ? "Try another search to find a saved fact or preference."
                    : "Save a useful preference or fact here, or ask Atlas to remember it in a conversation."}
                </p>
              </div>
            )}
          </div>
          {!loading && memories.length > 0 && (
            <p className="memory-count">
              Showing {visibleMemories.length} of {memories.length} memories stored locally.
            </p>
          )}
        </>
      )}
    </div>
  );
}
