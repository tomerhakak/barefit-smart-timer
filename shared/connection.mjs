import {sendMessage} from './transport.mjs';
export class Connection {
  constructor(base, credentials, onMessage, onStatus = () => {}) {
    this.base = base.replace(/\/$/, "");
    this.credentials = credentials;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.closed = false;
    this.attempt = 0;
    this.connect();
  }
  connect() {
    if (this.closed) return;
    this.onStatus("connecting");
    this.ws = new WebSocket(this.base.replace(/^http/, "ws") + "/socket");
    this.ws.onopen = () => {
      if (this.closed) return;
      this.ws.send(JSON.stringify({ type: "auth", ...this.credentials }));
    };
    this.ws.onmessage = (e) => {
      if (this.closed) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "authenticated") {this.attempt=0;this.onStatus("connected");}
        this.onMessage(msg);
      } catch {
        this.onStatus("error");
      }
    };
    this.ws.onerror = () => { if (!this.closed) this.onStatus("disconnected"); };
    this.ws.onclose = (e) => {
      if (this.closed) return;
      if ([1008, 4001].includes(e.code)) {
        this.onStatus("unauthorized");
        return;
      }
      this.onStatus("disconnected");
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(10000, 500 * Math.pow(2, this.attempt++)),
      );
    };
  }
  send(message) {
    return sendMessage(this.ws,message);
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}
export async function request(base, path, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
  const result = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  });
  const json = await result.json();
  if (!result.ok) throw Error(json.error || "שגיאת חיבור");
  return json;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError)
      throw Error('לא ניתן להגיע למסך. ודאו שהטלפון באותה רשת Wi-Fi, שהמסך פתוח, וסרקו קוד חדש.');
    throw error;
  } finally { clearTimeout(timeout); }
}
export function commandId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
