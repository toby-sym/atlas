function ToolBadge({ label, tone = 'green' }) {
  const toneClass = {
    green: 'bg-emerald-400/10 text-emerald-200 border-emerald-300/40',
    sky: 'bg-sky-400/10 text-sky-100 border-sky-300/40',
    slate: 'bg-slate-400/10 text-slate-200 border-slate-500/40',
  }[tone] || 'bg-emerald-400/10 text-emerald-200 border-emerald-300/40';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium tracking-wide shadow-[0_8px_20px_rgba(2,6,23,0.35)] ${toneClass}`}>
      {label}
    </span>
  );
}

export default ToolBadge;
