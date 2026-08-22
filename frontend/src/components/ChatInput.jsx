function ChatInput({ value, onChange, onSubmit, disabled }) {
  return (
    <form onSubmit={onSubmit} className="border-t-4 border-[#5D4037] bg-[#F9F1D8] p-4">
      <div className="flex items-center gap-3 rounded-full border-4 border-[#5D4037] bg-[#FAF6E9] px-3 py-2 shadow-[0_6px_0_#5D4037]">
        <input
          value={value}
          onChange={onChange}
          disabled={disabled}
          type="text"
          placeholder="Type a message..."
          className="flex-1 border-none bg-transparent px-2 py-2 font-medium text-[#3E2E28] placeholder:text-[#7F5539] focus:outline-none disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-[#5D4037] bg-[#76C893] text-xl shadow-[0_5px_0_#5D4037] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Send message"
        >
          ✉️
        </button>
      </div>
    </form>
  );
}

export default ChatInput;
