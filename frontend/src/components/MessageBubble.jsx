function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end pb-4">
        <div className="max-w-[80%] rounded-[1.75rem] rounded-br-md border-4 border-[#5D4037] bg-[#BFE8D3] px-4 py-3 text-[#2B3D35] shadow-[0_6px_0_#5D4037]">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
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
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

export default MessageBubble;
