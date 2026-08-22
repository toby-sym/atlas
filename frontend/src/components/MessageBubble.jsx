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
      <div className="flex justify-end pb-4">
        <div className="max-w-[80%] rounded-[1.75rem] rounded-br-md border-4 border-[#5D4037] bg-[#BFE8D3] px-4 py-3 text-[#2B3D35] shadow-[0_6px_0_#5D4037]">
          <div>{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start pb-4">
      <div className="max-w-[82%] rounded-[1.75rem] rounded-bl-md border-4 border-[#5D4037] bg-[#FAF6E9] px-4 py-3 text-[#3E2E28] shadow-[0_6px_0_#5D4037]">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border-2 border-[#5D4037] bg-[#FFE89C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
            Tom Nook
          </span>
        </div>
        <div>{content}</div>
      </div>
    </div>
  );
}

export default MessageBubble;
