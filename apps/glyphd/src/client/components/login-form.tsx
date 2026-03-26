import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FieldDescription, FieldGroup } from "./ui/field";

interface LoginFormProps {
  onAuthenticated: () => void;
}

export function LoginForm({ onAuthenticated }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch("/api/auth");
        const data = (await res.json()) as { authenticated: boolean };
        if (!cancelled && data.authenticated) {
          onAuthenticated();
          return;
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }

    checkAuth();
    return () => { cancelled = true; };
  }, [onAuthenticated]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter your password");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onAuthenticated();
        return;
      }

      const data = (await res.json()) as { error: string; retryAfterMs?: number };

      if (res.status === 429 && data.retryAfterMs) {
        const secs = Math.ceil(data.retryAfterMs / 1000);
        setError(`Too many attempts. Try again in ${secs}s.`);
      } else {
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Connecting...
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-6">
        <FieldGroup>
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-xl font-medium">glyphd</h1>
            <FieldDescription className="text-center">
              Enter password to continue
            </FieldDescription>
          </div>

          <Input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="h-9"
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading} size="lg">
            {loading ? "..." : "Continue"}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
