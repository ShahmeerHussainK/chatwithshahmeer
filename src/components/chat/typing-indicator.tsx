
export const TypingIndicator = () => {
  return (
    <div className="flex items-center space-x-2 px-4 py-2 max-w-[100px] bg-[#F2F2F7] dark:bg-zinc-700 rounded-2xl rounded-bl-sm">
      <div className="flex space-x-1">
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
      </div>
    </div>
  );
};
