import type { ServerWebSocket } from "bun";
import { createSession, writeToSession, resizeSession, destroySession } from "./terminal.ts";
import { getConfig } from "./config.ts";

type WsData = { sessionIds: Set<string> };

function sendJson(ws: ServerWebSocket<WsData>, msg: object) {
  ws.send(JSON.stringify(msg));
}

// Pre-encode the sessionId prefix for each session so we don't re-encode on every frame
const sessionPrefixes = new Map<string, Uint8Array>();

export const websocketHandler = {
  open(ws: ServerWebSocket<WsData>) {
    ws.data = { sessionIds: new Set() };
  },

  message(ws: ServerWebSocket<WsData>, message: string | Buffer) {
    if (typeof message !== "string") return;

    let msg: { type: string; [key: string]: unknown };
    try {
      msg = JSON.parse(message);
    } catch {
      sendJson(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "create": {
        const cols = Number(msg.cols) || 80;
        const rows = Number(msg.rows) || 24;
        const shell = getConfig().shell;

        // Use a mutable ref so the data callback can reference the sessionId
        // even though the session hasn't been returned yet when the callback is registered.
        // This is safe because PTY data arrives asynchronously — the session will always
        // be fully created before the first data fires.
        let sendFrame: ((data: Uint8Array) => void) | null = null;

        const session = createSession(shell, cols, rows, (data) => {
          sendFrame?.(data);
        });

        // Pre-compute the 36-byte sessionId prefix (UUID is always 36 ASCII chars)
        const prefix = new TextEncoder().encode(session.id);
        sessionPrefixes.set(session.id, prefix);

        sendFrame = (data) => {
          const frame = new Uint8Array(36 + data.length);
          frame.set(prefix, 0);
          frame.set(data, 36);
          ws.send(frame);
        };

        ws.data.sessionIds.add(session.id);
        sendJson(ws, { type: "created", sessionId: session.id });
        break;
      }

      case "input": {
        const { sessionId, data } = msg as { type: string; sessionId: string; data: string };
        writeToSession(sessionId, data);
        break;
      }

      case "resize": {
        const { sessionId, cols, rows } = msg as {
          type: string;
          sessionId: string;
          cols: number;
          rows: number;
        };
        resizeSession(sessionId, Number(cols), Number(rows));
        break;
      }

      case "destroy": {
        const sessionId = msg.sessionId as string;
        destroySession(sessionId);
        sessionPrefixes.delete(sessionId);
        ws.data.sessionIds.delete(sessionId);
        sendJson(ws, { type: "destroyed", sessionId });
        break;
      }

      default:
        sendJson(ws, { type: "error", message: `Unknown type: ${msg.type}` });
    }
  },

  close(ws: ServerWebSocket<WsData>) {
    for (const id of ws.data?.sessionIds ?? []) {
      destroySession(id);
      sessionPrefixes.delete(id);
    }
  },
};
