import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LENGTH = 4000;

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed.slice(0, MAX_MESSAGE_LENGTH));
    setText("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isTextEmpty = !text.trim();

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className={cn(
        "flex-1 flex items-center h-11 px-4 rounded-xl border transition-all duration-300 shadow-sm",
        disabled 
          ? "opacity-50 bg-accent/5 border-border/30" 
          : "bg-accent/15 border-border/40 hover:border-border/60 focus-within:border-primary/45 focus-within:bg-background/90 focus-within:ring-2 focus-within:ring-primary/10 focus-within:shadow-md"
      )}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Jarvis 正在思考中..." : "给 Jarvis 发送消息..."}
          disabled={disabled}
          maxLength={MAX_MESSAGE_LENGTH}
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      <Button 
        size="icon" 
        onClick={handleSend} 
        disabled={isTextEmpty || disabled}
        className={cn(
          "h-11 w-11 rounded-xl shadow-sm transition-all duration-300 select-none cursor-pointer flex items-center justify-center",
          isTextEmpty || disabled
            ? "bg-muted text-muted-foreground/40 border border-border/10 cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-[1.03] active:scale-95 shadow-md shadow-primary/10 hover:shadow-lg hover:shadow-primary/20"
        )}
      >
        <Send className={cn("h-4 w-4 transition-transform duration-300", !isTextEmpty && !disabled && "group-hover:translate-x-0.5 group-hover:-translate-y-0.5")} />
      </Button>
    </div>
  );
}
