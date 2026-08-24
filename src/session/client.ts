export type Role = "host" | "phone" | "projector";

export interface SessionMessage {
  type: string;
  room?: string;
  role?: Role;
  from?: Role;
  [key: string]: unknown;
}

const CHANNEL = "lumen-session";

export function createSession(role: Role, room: string): {
  send: (msg: SessionMessage) => void;
  on: (fn: (msg: SessionMessage) => void) => () => void;
  close: () => void;
} {
  const bus = new BroadcastChannel(CHANNEL);
  const listeners = new Set<(msg: SessionMessage) => void>();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  const handle = (msg: SessionMessage) => {
    for (const fn of listeners) fn(msg);
  };

  bus.onmessage = (ev: MessageEvent<SessionMessage>) => handle(ev.data);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", room, role }));
  });
  ws.addEventListener("message", (ev) => {
    try {
      handle(JSON.parse(String(ev.data)) as SessionMessage);
    } catch {
      // ignore
    }
  });

  return {
    send(msg) {
      const payload = { ...msg, room, role };
      bus.postMessage(payload);
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      bus.close();
      ws.close();
    },
  };
}

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}
