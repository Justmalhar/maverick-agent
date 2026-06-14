"use client";

import * as React from "react";
import { Send, Paperclip, Mic } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAttachment?: () => void;
  onVoiceRecord?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput = React.forwardRef<HTMLDivElement, ChatInputProps>(
  (
    {
      onSend,
      onAttachment,
      onVoiceRecord,
      disabled = false,
      placeholder = "Type a message...",
    },
    ref
  ) => {
    const [message, setMessage] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const adjustHeight = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 150);
      textarea.style.height = `${newHeight}px`;
    }, []);

    React.useEffect(() => {
      adjustHeight();
    }, [message, adjustHeight]);

    const handleSend = React.useCallback(() => {
      const trimmed = message.trim();
      if (!trimmed || disabled) return;

      onSend(trimmed);
      setMessage("");

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }, [message, disabled, onSend]);

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    return (
      <div
        ref={ref}
        className="flex items-end gap-2 border-t bg-background p-4"
      >
        {onAttachment && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onAttachment}
            disabled={disabled}
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
        )}

        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none rounded-xl border bg-muted/50 px-4 py-3 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              "transition-all duration-200"
            )}
          />
        </div>

        {onVoiceRecord && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onVoiceRecord}
            disabled={disabled}
            aria-label="Record voice"
          >
            <Mic className="h-5 w-5" />
          </Button>
        )}

        <Button
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={handleSend}
          disabled={disabled || !message.trim()}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    );
  }
);
ChatInput.displayName = "ChatInput";

export { ChatInput };
