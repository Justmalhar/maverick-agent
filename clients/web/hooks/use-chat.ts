import { create } from "zustand";
import { WSClient, type WSMessage } from "@/lib/websocket";
import { fetchSessions, fetchMessages, deleteSession, type Session, type Message } from "@/lib/api";

type ChatState = {
  messages: Message[];
  sessions: Session[];
  currentSessionId: string | null;
  isConnected: boolean;
  isStreaming: boolean;
};

type ChatActions = {
  sendMessage: (content: string) => Promise<void>;
  createSession: (name?: string) => Promise<Session>;
  switchSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  loadSessions: () => Promise<void>;
  connect: () => void;
  disconnect: () => void;
};

let wsClient: WSClient | null = null;

function getWSClient(get: () => ChatState, set: (partial: Partial<ChatState>) => void) {
  if (!wsClient) {
    wsClient = new WSClient({
      onMessage: (msg: WSMessage) => {
        const state = get();
        switch (msg.type) {
          case "text":
            set({
              messages: [
                ...state.messages,
                {
                  id: crypto.randomUUID(),
                  sessionId: state.currentSessionId || "",
                  role: "assistant",
                  content: msg.content,
                  createdAt: new Date().toISOString(),
                },
              ],
            });
            break;
          case "done":
            set({ isStreaming: false });
            break;
          case "error":
            console.error("Agent error:", msg.error);
            set({ isStreaming: false });
            break;
        }
      },
      onClose: () => set({ isConnected: false }),
    });
  }
  return wsClient;
}

export const useChatStore = create<ChatState & ChatActions>((set, get) => ({
  messages: [],
  sessions: [],
  currentSessionId: null,
  isConnected: false,
  isStreaming: false,

  connect: () => {
    const client = getWSClient(get, set);
    client.onConnectionChange((connected) => set({ isConnected: connected }));
    client.connect();
  },

  disconnect: () => {
    wsClient?.disconnect();
    wsClient = null;
  },

  loadSessions: async () => {
    try {
      const sessions = await fetchSessions();
      set({ sessions });
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  },

  createSession: async (name?: string) => {
    const session: Session = {
      id: crypto.randomUUID(),
      name: name || `Session ${new Date().toLocaleTimeString()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ sessions: [...state.sessions, session], currentSessionId: session.id }));
    return session;
  },

  switchSession: async (sessionId: string) => {
    set({ currentSessionId: sessionId, messages: [] });
    try {
      const messages = await fetchMessages(sessionId);
      set({ messages });
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== sessionId);
        const currentSessionId =
          state.currentSessionId === sessionId ? sessions[0]?.id || null : state.currentSessionId;
        return { sessions, currentSessionId };
      });
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  },

  sendMessage: async (content: string) => {
    const state = get();
    const sessionId = state.currentSessionId;
    if (!sessionId || !state.isConnected) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    set({ messages: [...state.messages, userMessage], isStreaming: true });

    const client = getWSClient(get, set);
    client.sendStreamingMessage(content, sessionId);
  },
}));