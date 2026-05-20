type EventHandler = (data: unknown) => void;

interface WsMessage {
  event: string;
  data:  unknown;
  ts:    number;
}

class RealtimeService {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private shouldConnect = false;

  connect(): void {
    this.shouldConnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldConnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  private openSocket(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host  = window.location.host;
    this.ws = new WebSocket(`${proto}//${host}/ws`);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(evt.data) as WsMessage;
        const handlers = this.handlers.get(msg.event);
        handlers?.forEach((h) => h(msg.data));
        // Wildcard handlers
        this.handlers.get("*")?.forEach((h) => h(msg));
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onclose = () => {
      if (!this.shouldConnect) return;
      this.ws = null;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        this.openSocket();
      }, this.reconnectDelay);
    };

    this.ws.onerror = () => {
      // onclose fires immediately after onerror — reconnect handled there
    };
  }
}

export const realtime = new RealtimeService();
