import { useEffect, useRef } from "react";
import { useWs } from "@/contexts/ws-context";
import { useTerminal } from "@/hooks/use-terminal";

interface TerminalTabProps {
  tabId: string;
  active: boolean;
  fontSize: number;
}

export function TerminalTab({ tabId, active, fontSize }: TerminalTabProps) {
  const { createSession, registerOutputHandler, unregisterOutputHandler, destroySession, sendInput, sendResize } =
    useWs();

  const sessionIdRef = useRef<string | null>(null);

  const { containerRef, fit, write, focus, getDimensions } = useTerminal({
    fontSize,
    onData: (data) => {
      if (sessionIdRef.current) sendInput(sessionIdRef.current, data);
    },
    onResize: (cols, rows) => {
      if (sessionIdRef.current) sendResize(sessionIdRef.current, cols, rows);
    },
  });

  // Create PTY session on mount, destroy on unmount
  useEffect(() => {
    let sessionId: string | null = null;
    let cancelled = false;

    const { cols, rows } = getDimensions();
    createSession(cols, rows).then((id) => {
      if (cancelled) {
        destroySession(id);
        return;
      }
      sessionId = id;
      sessionIdRef.current = id;
      registerOutputHandler(id, (data) => write(data));
      requestAnimationFrame(() => focus());
    });

    return () => {
      cancelled = true;
      if (sessionId) {
        destroySession(sessionId);
        unregisterOutputHandler(sessionId);
        sessionIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Fit + focus when this tab becomes active
  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => { fit(); focus(); });
    }
  }, [active]);

  // Fit on window resize (only when active to avoid measuring hidden elements)
  useEffect(() => {
    if (!active) return;
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  return (
    <div className="flex flex-1 overflow-hidden pt-1 px-2 pb-2 h-full">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
