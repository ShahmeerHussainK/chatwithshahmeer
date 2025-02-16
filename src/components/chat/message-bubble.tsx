
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
}

export const MessageBubble = ({ message, isUser }: MessageBubbleProps) => {
  return (
    <div
      className={cn(
        "max-w-[80%] px-4 py-2 rounded-2xl mb-2 animate-in slide-in-from-bottom duration-300",
        isUser
          ? "ml-auto bg-[#007AFF] text-white rounded-br-sm"
          : "bg-[#F2F2F7] dark:bg-zinc-700 rounded-bl-sm"
      )}
    >
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
    </div>
  );
};
