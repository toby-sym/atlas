import { useState } from "react";
import { Icon } from "./SpatialUI";

export default function ProjectManager({ projects, onClose, onCreate, onRename, onDelete }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (await onCreate(newName)) setNewName("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRename(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (await onRename(editingId, editingName)) setEditingId(null);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(project) {
    if (!window.confirm(`Delete the project “${project.name}”?`)) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(project.id);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="project-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-manager-title">
        <div className="project-modal-heading">
          <div>
            <div className="greeting">YOUR WORK, IN ITS OWN SPACE</div>
            <h2 id="project-manager-title">Manage projects</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close project manager">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p className="project-modal-description">Projects keep related work together. General is where your existing Atlas conversations and files live.</p>
        {error && <p className="project-manager-error" role="alert">{error}</p>}
        <form className="project-create-form" onSubmit={submitCreate}>
          <label>
            <span>New project</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={80}
              placeholder="For example, Home renovation"
              required
              disabled={busy}
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy || !newName.trim()}>
            <Icon name="plus" size={15} /> Create
          </button>
        </form>
        <div className="project-manager-list">
          {projects.map((project) => (
            <div className="project-manager-row" key={project.id}>
              {editingId === project.id ? (
                <form className="project-rename-form" onSubmit={submitRename}>
                  <input
                    autoFocus
                    aria-label={`New name for ${project.name}`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    maxLength={80}
                    required
                    disabled={busy}
                  />
                  <button type="submit" aria-label="Save project name" disabled={busy}><Icon name="check" size={14} /></button>
                  <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)} disabled={busy}><Icon name="close" size={14} /></button>
                </form>
              ) : (
                <>
                  <div className="project-manager-name">
                    <span className="workspace-avatar">{project.name.slice(0, 1).toUpperCase()}</span>
                    <span>{project.name}{project.id === "general" && <small>Existing Atlas workspace</small>}</span>
                  </div>
                  {project.id !== "general" && (
                    <div className="project-manager-actions">
                      <button type="button" disabled={busy} onClick={() => { setEditingId(project.id); setEditingName(project.name); setError(""); }}>Rename</button>
                      <button type="button" disabled={busy} onClick={() => removeProject(project)}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="project-modal-footer">
          <span>Projects and their data stay on this machine.</span>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
