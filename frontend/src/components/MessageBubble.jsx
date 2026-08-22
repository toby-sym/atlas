function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderInlineMarkdown(text) {
  const escaped = escapeHtml(text);

  const withLinks = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const withCode = withLinks.replace(/`([^`]+)`/g, '<code>$1</code>');
  const withStrong = withCode.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  const withEmphasis = withStrong.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>');

  return withEmphasis;
}

function renderMarkdown(content) {
  const text = (content || '').trim();
  if (!text) return '';

  const lines = text.split(/\n{2,}/).filter(Boolean);

  return lines
    .map((block) => {
      const trimmed = block.trim();

      if (/^#{1,6}\s+/.test(trimmed)) {
        const level = trimmed.match(/^#+/)[0].length;
        const headingText = trimmed.replace(/^#{1,6}\s+/, '');
        return `<h${level}>${renderInlineMarkdown(headingText)}</h${level}>`;
      }

      if (/^>\s+/.test(trimmed)) {
        return `<blockquote>${renderInlineMarkdown(trimmed.replace(/^>\s+/, ''))}</blockquote>`;
      }

      if (/^(?:-\s+|\*\s+)/.test(trimmed)) {
        const items = trimmed
          .split(/\n/)
          .filter(Boolean)
          .map((item) => `<li>${renderInlineMarkdown(item.replace(/^[-*]\s+/, ''))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items = trimmed
          .split(/\n/)
          .filter(Boolean)
          .map((item) => `<li>${renderInlineMarkdown(item.replace(/^\d+\.\s+/, ''))}</li>`)
          .join('');
        return `<ol>${items}</ol>`;
      }

      return `<p>${renderInlineMarkdown(trimmed)}</p>`;
    })
    .join('');
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const content = (
    <div
      className="markdown-content text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
    />
  );

  if (isUser) {
    return (
      <div className="flex justify-end pb-4 animate-message-enter">
        <div className="max-w-[82%] rounded-2xl rounded-br-md border border-blue-300/20 bg-gradient-to-br from-blue-500/20 to-sky-500/10 px-4 py-3 text-slate-100 shadow-[0_16px_40px_rgba(14,116,255,0.16)] backdrop-blur-sm">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-100/90">You</div>
          <div>{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start pb-4 animate-message-enter">
      <div className="max-w-[84%] rounded-2xl rounded-bl-md border border-slate-700/90 bg-slate-900/82 px-4 py-3 text-slate-100 shadow-[0_18px_45px_rgba(2,6,23,0.55)] backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-100">
            Atlas
          </span>
        </div>
        <div>{content}</div>
      </div>
    </div>
  );
}

export default MessageBubble;
