function Header({ status, onClearChat }) {
  const statusText = {
    online: 'Online',
    thinking: 'Thinking',
    tool: 'Using Tool',
  }[status] || 'Online';

  const badgeClasses = {
    online: 'bg-[#DFF7E8] text-[#2D7D4A] border-[#52B788]',
    thinking: 'bg-[#FFF0B8] text-[#7A5A00] border-[#FFB703]',
    tool: 'bg-[#F8E5D7] text-[#5D4037] border-[#7F5539]',
  }[status] || 'bg-[#DFF7E8] text-[#2D7D4A] border-[#52B788]';

  return (
    <header className="flex items-center justify-between gap-4 border-b-4 border-[#5D4037] bg-[#F9F1D8] px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-4 border-[#5D4037] bg-[#76C893] text-2xl shadow-[0_5px_0_#5D4037]">
          🍃
        </div>
        <div>
          <p className="font-display text-xl font-bold tracking-wide text-[#4A2E22]">
            Tom Nook
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full border-2 border-[#5D4037] ${status === 'thinking' ? 'bg-[#FFB703]' : status === 'tool' ? 'bg-[#7F5539]' : 'bg-[#52B788]'}`} />
            <span className={`rounded-full border-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClasses}`}>
              {statusText}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClearChat}
        className="rounded-full border-4 border-[#5D4037] bg-[#FFE89C] px-4 py-2 text-sm font-bold text-[#5D4037] shadow-[0_5px_0_#5D4037] transition-transform hover:-translate-y-0.5"
      >
        Clear chat
      </button>
    </header>
  );
}

export default Header;
