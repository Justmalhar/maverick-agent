'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-screen bg-gray-950 text-white"
    >
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -240 }}
            animate={{ x: 0 }}
            exit={{ x: -240 }}
            className="w-60 border-r border-white/10 bg-gray-900/50 backdrop-blur-xl p-4 flex flex-col"
          >
            <div className="mb-4">
              <h1 className="text-lg font-semibold">Maverick Agent</h1>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Conversation list placeholder */}
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg p-2 hover:bg-white/5 cursor-pointer transition-colors">
                    <p className="text-sm text-gray-400">Conversation {i}</p>
                  </div>
                ))}
              </div>
            </div>
            <button className="mt-4 w-full rounded-lg bg-blue-600/20 p-2 text-sm hover:bg-blue-600/30 transition-colors">
              New Chat
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-white/10 p-4 bg-gray-900/30 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-2 hover:bg-white/10 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h2 className="text-sm font-medium">New Conversation</h2>
          <div className="w-8" /> {/* Spacer */}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Message bubbles placeholder */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex justify-start"
          >
            <div className="glass-card max-w-md rounded-2xl rounded-bl-sm p-4">
              <p className="text-sm">Hello! How can I assist you today?</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex justify-end"
          >
            <div className="glass-card max-w-md rounded-2xl rounded-br-sm p-4 bg-blue-600/20">
              <p className="text-sm">Tell me about the project.</p>
            </div>
          </motion.div>
        </div>

        {/* Input Area */}
        <div className="border-t border-white/10 p-4 bg-gray-900/30 backdrop-blur-sm">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder-gray-500"
            />
            <button className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium hover:bg-blue-500 transition-colors">
              Send
            </button>
          </div>
        </div>
      </main>
    </motion.div>
  );
}