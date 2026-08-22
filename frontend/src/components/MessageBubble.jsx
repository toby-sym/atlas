import ReactMarkdown from 'react-markdown';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  const markdownStyles = {
    h1: ({ children }) => <h1 className="mb-2 mt-0 text-xl font-bold text-[#3E2E28]">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-0 text-lg font-bold text-[#3E2E28]">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-0 text-base font-bold text-[#3E2E28]">{children}</h3>,
    p: ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-relaxed">{children}</p>,
    strong: ({ children }) => <strong className="font-bold text-[#2B3D35]">{children}</strong>,
    em: ({ children }) => <em className="italic text-[#5D4037]">{children}</em>,
    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">{children}</ol>,
    li: ({ children }) => <li className="ml-1">{children}</li>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className="font-bold underline decoration-2 underline-offset-2">
        {children}
      </a>
    ),
    code: ({ children }) => <code className="rounded bg-[#F7E7C6] px-1 py-0.5 text-xs text-[#5D4037]">{children}</code>,
    blockquote: ({ children }) => (
      <blockquote className="mb-2 border-l-4 border-[#76C893] bg-[#F3F9F4] pl-3 text-sm italic text-[#4D4B43]">
        {children}
      </blockquote>
    ),
  };

  const content = (
    <ReactMarkdown components={markdownStyles}>{message.content}</ReactMarkdown>
  );

  if (isUser) {
    return (
      <div className="flex justify-end pb-4">
        <div className="max-w-[80%] rounded-[1.75rem] rounded-br-md border-4 border-[#5D4037] bg-[#BFE8D3] px-4 py-3 text-[#2B3D35] shadow-[0_6px_0_#5D4037]">
          <div className="text-sm leading-relaxed">{content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start pb-4">
      <div className="max-w-[82%] rounded-[1.75rem] rounded-bl-md border-4 border-[#5D4037] bg-[#FAF6E9] px-4 py-3 text-[#3E2E28] shadow-[0_6px_0_#5D4037]">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border-2 border-[#5D4037] bg-[#FFE89C] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5D4037]">
            Villager Agent
          </span>
        </div>
        <div className="text-sm leading-relaxed">{content}</div>
      </div>
    </div>
  );
}

export default MessageBubble;
