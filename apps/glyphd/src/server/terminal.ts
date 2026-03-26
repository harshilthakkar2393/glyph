import { randomUUID } from "crypto";

export interface Session {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

// Map session ID → WebSocket send callback
const sessionOutputHandlers = new Map<string, (data: Uint8Array) => void>();

export function createSession(
  shell: string,
  cols: number,
  rows: number,
  onData: (data: Uint8Array) => void
): Session {
  const id = randomUUID();

  sessionOutputHandlers.set(id, onData);

  const proc = Bun.spawn([shell], {
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
    cwd: process.env.HOME,
    terminal: {
      cols,
      rows,
      data(_term, data) {
        const handler = sessionOutputHandlers.get(id);
        handler?.(data);
      },
      exit(_term, _code) {
        // Clean up session when PTY closes
        sessions.delete(id);
        sessionOutputHandlers.delete(id);
      },
    },
  });

  const session: Session = { id, proc, createdAt: new Date() };
  sessions.set(id, session);
  return session;
}

export function writeToSession(id: string, data: string | Uint8Array): void {
  const session = sessions.get(id);
  if (!session) return;
  // proc.terminal is the Terminal object when using terminal option
  (session.proc as any).terminal?.write(data);
}

export function resizeSession(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  (session.proc as any).terminal?.resize(cols, rows);
}

export function destroySession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    (session.proc as any).terminal?.close();
    session.proc.kill();
  } catch {
    // ignore cleanup errors
  }
  sessions.delete(id);
  sessionOutputHandlers.delete(id);
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

// Cleanup all sessions on process exit
function cleanupAll() {
  for (const id of sessions.keys()) {
    destroySession(id);
  }
}

process.on("SIGINT", () => { cleanupAll(); process.exit(0); });
process.on("SIGTERM", () => { cleanupAll(); process.exit(0); });
