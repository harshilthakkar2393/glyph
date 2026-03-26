import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";

type OutputHandler = (data: Uint8Array) => void;

interface WsContextValue {
  connected: boolean;
  createSession: (cols: number, rows: number) => Promise<string>;
  registerOutputHandler: (sessionId: string, handler: OutputHandler) => void;
  unregisterOutputHandler: (sessionId: string) => void;
  destroySession: (sessionId: string) => void;
  sendInput: (sessionId: string, data: string) => void;
  sendResize: (sessionId: string, cols: number, rows: number) => void;
}

const WsContext = createContext<WsContextValue | null>(null);

export function WsProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  // Messages that arrived before the socket was open — flushed on connect
  const sendQueue = useRef<string[]>([]);

  // FIFO queue for pending createSession promises.
  // Safe because the server processes messages in order and responds in order.
  const pendingCreates = useRef<Array<(sessionId: string) => void>>([]);

  // sessionId → output handler
  const outputHandlers = useRef<Map<string, OutputHandler>>(new Map());

  // Buffer output that arrives before a handler is registered
  const pendingOutput = useRef<Map<string, Uint8Array[]>>(new Map());

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Flush any messages that were sent before the socket was open
      for (const msg of sendQueue.current) ws.send(msg);
      sendQueue.current = [];
    };
    ws.onclose = () => {
      // Guard: only clear ref if this is still the active socket.
      // StrictMode double-mounts cause ws1.onclose to fire async after ws2 is set.
      if (wsRef.current === ws) {
        setConnected(false);
        wsRef.current = null;
      }
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        // Binary frame: first 36 bytes = sessionId, rest = PTY data
        const bytes = new Uint8Array(e.data);
        const sessionId = new TextDecoder().decode(bytes.subarray(0, 36));
        const data = bytes.subarray(36);

        const handler = outputHandlers.current.get(sessionId);
        if (handler) {
          handler(data);
        } else {
          // Buffer until the tab registers its handler
          const buf = pendingOutput.current.get(sessionId) ?? [];
          buf.push(new Uint8Array(data)); // copy — the buffer reuses memory otherwise
          pendingOutput.current.set(sessionId, buf);
        }
      } else {
        const msg = JSON.parse(e.data as string) as { type: string; [k: string]: unknown };
        switch (msg.type) {
          case "created": {
            const resolve = pendingCreates.current.shift();
            resolve?.(msg.sessionId as string);
            break;
          }
        }
      }
    };

    return () => ws.close();
  }, []);

  // Send a message, queuing it if the socket isn't open yet
  const safeSend = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      sendQueue.current.push(msg);
    }
  }, []);

  const createSession = useCallback((cols: number, rows: number): Promise<string> => {
    return new Promise((resolve) => {
      pendingCreates.current.push(resolve);
      safeSend(JSON.stringify({ type: "create", cols, rows }));
    });
  }, [safeSend]);

  const registerOutputHandler = useCallback((sessionId: string, handler: OutputHandler) => {
    outputHandlers.current.set(sessionId, handler);
    // Flush any output that arrived before the handler was ready
    const buffered = pendingOutput.current.get(sessionId);
    if (buffered) {
      for (const chunk of buffered) handler(chunk);
      pendingOutput.current.delete(sessionId);
    }
  }, []);

  const unregisterOutputHandler = useCallback((sessionId: string) => {
    outputHandlers.current.delete(sessionId);
    pendingOutput.current.delete(sessionId);
  }, []);

  const destroySession = useCallback((sessionId: string) => {
    safeSend(JSON.stringify({ type: "destroy", sessionId }));
    outputHandlers.current.delete(sessionId);
    pendingOutput.current.delete(sessionId);
  }, [safeSend]);

  const sendInput = useCallback((sessionId: string, data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", sessionId, data }));
    }
  }, []);

  const sendResize = useCallback((sessionId: string, cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "resize", sessionId, cols, rows }));
    }
  }, []);

  return (
    <WsContext.Provider
      value={{
        connected,
        createSession,
        registerOutputHandler,
        unregisterOutputHandler,
        destroySession,
        sendInput,
        sendResize,
      }}
    >
      {children}
    </WsContext.Provider>
  );
}

export function useWs(): WsContextValue {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used within <WsProvider>");
  return ctx;
}
