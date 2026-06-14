"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  avatar?: string;
}

interface MessageProps {
  message: ChatMessage;
  isLatest?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, '<code class="rounded bg-muted px-1.5 py-0.5 text-sm">$1</code>')
    .replace(/\n/g, "<br />");
}

const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ message, isLatest = false }, ref) => {
    const isUser = message.role === "user";

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={cn(
          "flex gap-3",
          isUser ? "flex-row-reverse" : "flex-row"
        )}
      >
        <Avatar
          size="sm"
          src={message.avatar}
          alt={isUser ? "You" : "Assistant"}
          fallback={isUser ? undefined : undefined}
          className="mt-1 shrink-0"
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </Avatar>

        <div
          className={cn(
            "flex flex-col gap-1 max-w-[80%]",
            isUser ? "items-end" : "items-start"
          )}
        >
          <div
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm",
              isUser
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted rounded-tl-sm"
            )}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content),
              }}
            />
          </div>
          <span className="text-xs text-muted-foreground px-1">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </motion.div>
    );
  }
);
Message.displayName = "Message";

export { Message };
