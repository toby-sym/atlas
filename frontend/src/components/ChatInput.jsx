import { useRef } from 'react';

function ChatInput({ value, onChange, onSubmit, onFileSelect, disabled, uploading }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
    event.target.value = '';
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-slate-800/90 bg-slate-900/90 p-4">
      <div className="flex items-center gap-3 rounded-xl border border-slate-700/90 bg-slate-950/75 px-3 py-2 shadow-[0_10px_30px_rgba(2,6,23,0.35)]">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          aria-label="Choose a file to add to the workspace"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 text-2xl font-light text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Add a file to the workspace"
          title="Add a file to the workspace"
        >
          +
        </button>
        <input
          value={value}
          onChange={onChange}
          disabled={disabled || uploading}
          type="text"
          placeholder="Ask Atlas to plan, analyze, or execute..."
          className="flex-1 border-none bg-transparent px-2 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || uploading || !value.trim()}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-sky-400/50 bg-sky-500/20 text-sm font-semibold text-sky-100 shadow-[inset_0_0_14px_rgba(56,189,248,0.35)] transition duration-200 hover:-translate-y-0.5 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
        >
          {uploading ? '...' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export default ChatInput;
