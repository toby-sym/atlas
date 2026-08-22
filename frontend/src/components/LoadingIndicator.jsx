function LoadingIndicator() {
  return (
    <div className="mb-3 flex items-center gap-3 pl-2 text-[#3B6B4F]">
      <div className="loading-dots" aria-label="assistant is thinking">
        <span />
        <span />
        <span />
      </div>
      <span className="text-sm font-semibold">Villager Agent is thinking...</span>
    </div>
  );
}

export default LoadingIndicator;
