import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Plugin } from "vite";

type Role = "host" | "phone" | "projector";

interface Client {
  ws: WebSocket;
  role: Role;
  room: string;
}

interface Envelope {
  type: string;
  room?: string;
  role?: Role;
  [key: string]: unknown;
}

/**
 * Tiny signaling hub so an iPhone, the host laptop, and the projector
 * window can share one session. Simulation does not need this.
 */
export function sessionPlugin(): Plugin {
  return {
    name: "lumen-session",
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const clients = new Set<Client>();

      server.httpServer?.on("upgrade", (req, socket, head) => {
        const url = req.url ?? "";
        if (!url.startsWith("/ws")) return;
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      });

      wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
        let client: Client | null = null;
        ws.on("message", (raw) => {
          let msg: Envelope;
          try {
            msg = JSON.parse(String(raw)) as Envelope;
          } catch {
            return;
          }
          if (msg.type === "join" && msg.room && msg.role) {
            client = { ws, role: msg.role, room: msg.room };
            clients.add(client);
            broadcast(clients, client.room, {
              type: "peer-joined",
              role: client.role,
            }, ws);
            return;
          }
          if (!client) return;
          broadcast(clients, client.room, { ...msg, from: client.role }, ws);
        });
        ws.on("close", () => {
          if (!client) return;
          clients.delete(client);
          broadcast(clients, client.room, {
            type: "peer-left",
            role: client.role,
          });
        });
      });
    },
  };
}

function broadcast(
  clients: Set<Client>,
  room: string,
  msg: Envelope,
  except?: WebSocket,
): void {
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c.room !== room || c.ws === except) continue;
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
}
