import { Hono } from "hono";
import { networkInterfaces } from "os";
import { execSync } from "child_process";
import path from "path";
import { websocketHandler } from "./websocket.ts";
import { setConfig } from "./config.ts";
import {
  createAuthConfig,
  isAuthenticated,
  checkPassword,
  checkRateLimit,
  getClientIp,
  createSessionCookie,
  getCookieHeader,
} from "./auth.ts";

const VERSION = "0.1.5";

// Resolve dist/client path — works both from source and compiled binary
// Compiled binary: import.meta.dir = "/$bunfs/root/", use process.execPath instead
// Source: import.meta.dir = ".../src/server/", go up 2 levels
const isCompiled = import.meta.dir.includes("$bunfs");
const distPath = isCompiled
  ? path.join(path.dirname(process.execPath), "..", "dist", "client")
  : path.join(import.meta.dir, "..", "..", "dist", "client");

interface Config {
  port: number;
  host: string;
  shell: string;
  password?: string;
}

async function handleUpgrade(): Promise<never> {
  console.log(`  Checking for updates...`);
  try {
    const res = await fetch("https://registry.npmjs.org/glyphd/latest");
    const data = (await res.json()) as { version: string };
    const latest = data.version;

    if (latest === VERSION) {
      console.log(`  Already on latest version (${VERSION})`);
      process.exit(0);
    }

    console.log(`  Updating glyphd ${VERSION} → ${latest}\n`);
    execSync("npm i -g glyphd@latest", { stdio: "inherit" });
    console.log(`\n  Updated to glyphd v${latest}`);
  } catch {
    console.error("  Failed to upgrade. Try manually: npm i -g glyphd@latest");
  }
  process.exit(0);
}

function isNewer(latest: string, current: string): boolean {
  const l = latest.split(".").map(Number);
  const c = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

async function checkForUpdates(): Promise<void> {
  try {
    const res = await fetch("https://registry.npmjs.org/glyphd/latest");
    const data = (await res.json()) as { version: string };
    const latest = data.version;
    if (isNewer(latest, VERSION)) {
      console.log(`  Update available: ${VERSION} → ${latest}`);
      console.log(`  Run \`glyphd upgrade\` to update\n`);
    }
  } catch {
    // offline or registry down — silently skip
  }
}

async function parseArgs(): Promise<Config> {
  const args = process.argv.slice(2);

  for (const arg of args) {
    if (arg === "upgrade") {
      await handleUpgrade();
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`
glyphd v${VERSION} — Spawn a shell. Access it from anywhere.

Usage:
  glyphd [options]
  glyphd upgrade           Update to the latest version

Options:
  --port <port>        Port to listen on (default: 3000, env: PORT)
  --host <host>        Host to bind to (default: 0.0.0.0, env: HOST)
  --shell <shell>      Shell to spawn (default: $SHELL, env: GLYPHD_SHELL)
  --password <pass>    Require password auth (env: GLYPHD_PASSWORD)
  -h, --help           Show this help
  -v, --version        Show version
`);
      process.exit(0);
    }
    if (arg === "--version" || arg === "-v") {
      console.log(VERSION);
      process.exit(0);
    }
  }

  const config: Config = {
    port: parseInt(process.env.PORT ?? "3000"),
    host: process.env.HOST ?? "0.0.0.0",
    shell: process.env.GLYPHD_SHELL ?? process.env.SHELL ?? "/bin/bash",
    password: process.env.GLYPHD_PASSWORD,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
        config.port = parseInt(args[++i] ?? "3000");
        break;
      case "--host":
        config.host = args[++i] ?? "0.0.0.0";
        break;
      case "--shell":
        config.shell = args[++i] ?? "/bin/bash";
        break;
      case "--password":
        config.password = args[++i];
        break;
    }
  }

  return config;
}

if (process.platform === "win32") {
  console.error("glyphd: Windows is not yet supported (Bun PTY requires POSIX).");
  console.error("Use WSL2: wsl --install, then run glyphd inside WSL.");
  process.exit(1);
}

const config = await parseArgs();
setConfig(config);
const authConfig = createAuthConfig(config.password);

const app = new Hono();

// Auth middleware — protects all /api/* routes except /api/auth
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === "/api/auth") return next();
  if (!isAuthenticated(c.req.raw)) return c.json({ error: "Unauthorized" }, 401);
  return next();
});

// Auth status check — client calls this on mount to decide whether to show login
app.get("/api/auth", (c) => {
  return c.json({ authenticated: isAuthenticated(c.req.raw) });
});

// Login — validate password, set session cookie
app.post("/api/auth", async (c) => {
  const ip = getClientIp(c.req.raw);
  const rateCheck = checkRateLimit(ip);

  if (!rateCheck.allowed) {
    return c.json(
      { error: "Too many attempts", retryAfterMs: rateCheck.retryAfterMs },
      429,
    );
  }

  const body = await c.req.json<{ password?: string }>();
  const password = body?.password;

  if (!password || typeof password !== "string") {
    return c.json({ error: "Password required" }, 400);
  }

  if (!checkPassword(password, authConfig.password)) {
    return c.json(
      { error: "Invalid password", remaining: rateCheck.remaining },
      401,
    );
  }

  const cookie = createSessionCookie();
  return c.json({ ok: true }, 200, { "Set-Cookie": getCookieHeader(cookie) });
});

// Health check
app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));

// Serve pre-built static assets (production)
// In dev, Vite serves the frontend on :5173 and proxies /api + /ws to us
app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = Bun.file(distPath + filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback
  const index = Bun.file(distPath + "/index.html");
  if (await index.exists()) {
    return new Response(index, { headers: { "Content-Type": "text/html" } });
  }

  return c.text("Run `bun run build` to generate the client bundle.", 404);
});

// Try to start server, auto-increment port if in use (up to 10 attempts)
let server: ReturnType<typeof Bun.serve>;
let actualPort = config.port;

for (let attempt = 0; attempt < 10; attempt++) {
  try {
    server = Bun.serve({
      port: actualPort,
      hostname: config.host,

      fetch(req) {
        const url = new URL(req.url);

        // Upgrade WebSocket connections
        if (url.pathname === "/ws") {
          if (!isAuthenticated(req)) {
            return new Response("Unauthorized", { status: 401 });
          }
          const upgraded = server.upgrade(req);
          if (upgraded) return undefined as unknown as Response;
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        return app.fetch(req);
      },

      websocket: websocketHandler,
    });
    break;
  } catch (e: unknown) {
    if (e instanceof Error && "code" in e && e.code === "EADDRINUSE") {
      if (attempt < 9) {
        actualPort++;
        continue;
      }
      console.error(`glyphd: ports ${config.port}-${actualPort} are all in use.`);
      process.exit(1);
    }
    throw e;
  }
}

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down...");
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function getNetworkAddress(): string | undefined {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
}

console.log(`\n  glyphd v${VERSION}`);
if (actualPort !== config.port) {
  console.log(`  Port ${config.port} is in use, using ${actualPort}`);
}
console.log(`  Local:   http://localhost:${actualPort}`);
const netAddr = getNetworkAddress();
if (netAddr) {
  console.log(`  Network: http://${netAddr}:${actualPort}`);
}
if (authConfig.generated) {
  console.log(`\n  Password: ${authConfig.password}`);
}
console.log(`\n  Press Ctrl+C to stop.\n`);

// Non-blocking update check
checkForUpdates();
