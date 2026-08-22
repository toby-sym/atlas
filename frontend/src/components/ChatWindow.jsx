import MessageBubble from './MessageBubble';
import LoadingIndicator from './LoadingIndicator';
import ToolBadge from './ToolBadge';

function ChatWindow({ messages, loading, toolStatus }) {
  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-950/90 via-[#060D1D] to-slate-950 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        {messages.length === 0 && !loading && (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <div className="animate-panel-enter rounded-2xl border border-slate-700/80 bg-slate-900/70 px-6 py-5 text-center shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur-md">
              <p className="text-2xl font-semibold tracking-[0.1em] text-slate-100">ATLAS COMMAND CONSOLE</p>
              <p className="mt-2 text-sm text-slate-300">Plan, prioritize, research, and execute with a focused business copilot.</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          if (message.role === 'tool') {
            return (
              <div key={`${message.tool_call_id || index}-tool`} className="mb-4 flex justify-start animate-message-enter">
                <ToolBadge label={message.content || 'Tool step'} tone={message.content?.toLowerCase().includes('search') ? 'sky' : message.content?.toLowerCase().includes('memory') ? 'green' : 'slate'} />
              </div>
            );
          }

          return <MessageBubble key={`${message.role}-${index}`} message={message} />;
        })}

        {toolStatus && (
          <div className="mb-4 flex justify-start animate-message-enter">
            <ToolBadge label={toolStatus} tone={toolStatus.toLowerCase().includes('search') ? 'sky' : toolStatus.toLowerCase().includes('memory') ? 'green' : 'slate'} />
          </div>
        )}

        {loading && <LoadingIndicator />}
      </div>
    </div>
  );
}

export default ChatWindow;
