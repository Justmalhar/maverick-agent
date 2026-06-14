"use client";

import * as React from "react";
import { Plus, MessageSquare, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface ChatSession {
  id: string;
  name: string;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      sessions,
      activeSessionId,
      onSelectSession,
      onNewChat,
      isOpen,
      onClose,
    },
    ref
  ) => {
    const sortedSessions = [...sessions].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );

    const sidebarContent = (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Chats</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              aria-label="New chat"
            >
              <Plus className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {sortedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <MessageSquare className="mb-3 h-8 w-8 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs">Start a new chat to begin</p>
              </div>
            ) : (
              <div className="space-y-1">
                {sortedSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent",
                      session.id === activeSessionId &&
                        "bg-accent text-accent-foreground"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-medium">
                        {session.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(session.updatedAt)}
                      </span>
                    </div>
                    {session.lastMessage && (
                      <p className="truncate text-xs text-muted-foreground">
                        {session.lastMessage}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    );

    return (
      <>
        {/* Desktop sidebar */}
        <div
          ref={ref}
          className="hidden md:flex h-full w-72 flex-col border-r bg-background"
        >
          {sidebarContent}
        </div>

        {/* Mobile overlay */}
        <AnimatePresence>
          {isOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={onClose}
              />
              <motion.div
                ref={ref}
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 z-50 w-72 bg-background md:hidden"
              >
                {sidebarContent}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }
);
Sidebar.displayName = "Sidebar";

export { Sidebar };
