function ToolBadge({ label, tone = 'green' }) {
  const toneClass = {
    green: 'bg-[#DFF7E8] text-[#2E6B4A] border-[#76C893]',
    yellow: 'bg-[#FFF0B8] text-[#7A5A00] border-[#FFB703]',
    wood: 'bg-[#F2E6D9] text-[#5D4037] border-[#7F5539]',
  }[tone] || 'bg-[#DFF7E8] text-[#2E6B4A] border-[#76C893]';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-semibold shadow-[0_3px_0_rgba(93,64,55,0.25)] ${toneClass}`}>
      {label}
    </span>
  );
}

export default ToolBadge;
