import { useState, useCallback } from "react";
import { WsProvider } from "./contexts/ws-context";
import { LoginForm } from "./components/login-form";
import { TerminalWorkspace } from "./components/terminal-workspace";

export function App() {
  const [authenticated, setAuthenticated] = useState(false);

  const handleAuthenticated = useCallback(() => setAuthenticated(true), []);

  if (!authenticated) {
    return <LoginForm onAuthenticated={handleAuthenticated} />;
  }

  return (
    <WsProvider>
      <TerminalWorkspace />
    </WsProvider>
  );
}
