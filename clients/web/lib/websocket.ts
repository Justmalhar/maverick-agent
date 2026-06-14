export type WSMessage =
  | { type: "text"; content: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; output: unknown }
  | { type: "done"; messageId: string }
  | { type: "error"; error: string };

export type WSConfig = {
  url?: string;
  onMessage?: (msg: WSMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
};

const DEFAULT_URL = "ws://localhost:4096/ws";
const HEARTBEAT_INTERVAL = 30_000;
const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class WSClient {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private _isConnected = false;
  private listeners = new Set<(connected: boolean) => void>();

  get isConnected() {
    return this._isConnected;
  }

  constructor(config: WSConfig = {}) {
    this.config = config;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const url = this.config.url || DEFAULT_URL;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this._isConnected = true;
      this.reconnectAttempt = 0;
      this.startHeartbeat();
      this.config.onOpen?.();
      this.listeners.forEach((l) => l(true));
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      this.stopHeartbeat();
      this.config.onClose?.();
      this.listeners.forEach((l) => l(false));
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      this.config.onError?.(err);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        this.config.onMessage?.(msg);
      } catch {
        console.error("Failed to parse WebSocket message:", event.data);
      }
    };
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = RECONNECT_DELAYS.length;
    this.ws?.close();
    this.ws = null;
  }

  send(data: unknown) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(data));
  }

  sendStreamingMessage(content: string, sessionId: string) {
    this.send({
      type: "chat",
      content,
      sessionId,
      stream: true,
    });
  }

  onConnectionChange(listener: (connected: boolean) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempt >= RECONNECT_DELAYS.length) return;

    const delay = RECONNECT_DELAYS[this.reconnectAttempt];
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}