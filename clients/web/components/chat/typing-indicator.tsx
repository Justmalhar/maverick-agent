"use client";

import * as React from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Bot } from "lucide-react";

interface TypingIndicatorProps {
  className?: string;
}

const dotVariants = {
  initial: { y: 0 },
  animate: { y: -4 },
};

const dotTransition = (delay: number) => ({
  duration: 0.3,
  repeat: Infinity,
  repeatType: "reverse" as const,
  delay,
  ease: "easeInOut",
});

const TypingIndicator = React.forwardRef<HTMLDivElement, TypingIndicatorProps>(
  ({ className }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className={cn("flex gap-3", className)}
      >
        <Avatar size="sm" className="mt-1 shrink-0">
          <Bot className="h-4 w-4" />
        </Avatar>

        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-1 rounded-xl rounded-tl-sm bg-muted px-4 py-3">
            {[0, 0.15, 0.3].map((delay, i) => (
              <motion.div
                key={i}
                className="h-2 w-2 rounded-full bg-muted-foreground/40"
                variants={dotVariants}
                initial="initial"
                animate="animate"
                transition={dotTransition(delay)}
              />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }
);
TypingIndicator.displayName = "TypingIndicator";

export { TypingIndicator };
