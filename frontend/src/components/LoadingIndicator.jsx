function LoadingIndicator() {
  return (
    <div className="mb-3 flex items-center gap-3 pl-2 text-sky-200">
      <div className="loading-dots" aria-label="assistant is thinking">
        <span />
        <span />
        <span />
      </div>
      <span className="text-sm font-medium tracking-wide">Atlas is processing your request...</span>
    </div>
  );
}

export default LoadingIndicator;
