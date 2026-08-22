import MessageBubble from './MessageBubble';
import LoadingIndicator from './LoadingIndicator';
import ToolBadge from './ToolBadge';

function ChatWindow({ messages, loading, toolStatus }) {
  return (
    <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_#fffdfa_0%,_#F3ECE0_100%)] px-4 py-5">
      <div className="mx-auto max-w-3xl">
        {messages.length === 0 && !loading && (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <div className="rounded-[2rem] border-4 border-[#5D4037] bg-[#F9F1D8] px-6 py-4 text-center shadow-[0_8px_0_#5D4037]">
              <p className="font-display text-2xl text-[#5D4037]">Welcome to your town!</p>
              <p className="mt-2 text-sm text-[#6B4E3A]">Ask the Villager Agent anything.</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          if (message.role === 'tool') {
            return (
              <div key={`${message.tool_call_id || index}-tool`} className="mb-4 flex justify-start">
                <ToolBadge label={message.content || 'Tool step'} tone={message.content?.toLowerCase().includes('search') ? 'yellow' : message.content?.toLowerCase().includes('memory') ? 'green' : 'wood'} />
              </div>
            );
          }

          return <MessageBubble key={`${message.role}-${index}`} message={message} />;
        })}

        {toolStatus && (
          <div className="mb-4 flex justify-start">
            <ToolBadge label={toolStatus} tone={toolStatus.toLowerCase().includes('search') ? 'yellow' : toolStatus.toLowerCase().includes('memory') ? 'green' : 'wood'} />
          </div>
        )}

        {loading && <LoadingIndicator />}
      </div>
    </div>
  );
}

export default ChatWindow;
