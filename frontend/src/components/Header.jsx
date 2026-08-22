function Header({ status, onClearChat }) {
  const statusText = {
    online: 'Operational',
    thinking: 'Analyzing',
    tool: 'Executing',
  }[status] || 'Operational';

  const badgeClasses = {
    online: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
    thinking: 'border-sky-400/35 bg-sky-400/10 text-sky-200',
    tool: 'border-cyan-300/35 bg-cyan-300/10 text-cyan-100',
  }[status] || 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200';

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-800/90 bg-slate-900/80 px-5 py-4 md:px-7">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-500/50 bg-gradient-to-br from-sky-400/20 to-blue-800/30 text-base font-semibold tracking-[0.18em] text-sky-100 shadow-[inset_0_0_14px_rgba(14,165,233,0.35)]">
          AT
        </div>
        <div>
          <p className="text-xl font-semibold tracking-[0.18em] text-slate-100">
            ATLAS
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Executive Personal Assistant</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${status === 'thinking' ? 'animate-pulse bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.9)]' : status === 'tool' ? 'animate-pulse bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.85)]' : 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.8)]'}`} />
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeClasses}`}>
              {statusText}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClearChat}
        className="rounded-lg border border-slate-700 bg-slate-800/90 px-4 py-2 text-sm font-medium tracking-wide text-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-slate-800"
      >
        Clear Session
      </button>
    </header>
  );
}

export default Header;
