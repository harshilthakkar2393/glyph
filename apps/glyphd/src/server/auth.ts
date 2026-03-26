import { randomBytes, createHmac, timingSafeEqual } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthConfig {
  password: string;
  generated: boolean;
}

// ─── Session secret (ephemeral — dies with the process) ──────────────────────

const SESSION_SECRET = randomBytes(32);
const COOKIE_NAME = "glyphd_session";

// ─── Word list for auto-generated passwords ────────────────────────────────

const WORD_LIST = [
  "acorn","amber","anvil","arbor","arrow","atlas","azure","badge","basin","beach",
  "birch","blaze","bloom","board","bower","brain","brass","brave","brick","brisk",
  "brook","brush","cabin","cairn","camel","candy","cargo","cedar","chalk","charm",
  "chess","chief","cider","claim","cliff","cloud","clover","coach","coast","cobra",
  "coral","craft","crane","crest","crown","crush","curve","daisy","delta","denim",
  "depot","derby","diver","dodge","drift","drum","dune","eager","eagle","earth",
  "ember","entry","epoch","equal","event","fable","falcon","feast","fence","ferry",
  "fiber","field","finch","flame","flask","fleet","flint","flora","forge","forum",
  "frost","fruit","gavel","giant","glade","gleam","globe","gnome","grain","grape",
  "grasp","gravel","grove","guard","guide","haven","hawk","hazel","heart","hedge",
  "heron","hinge","holly","hover","ivory","jewel","joint","karma","kayak","lager",
  "lance","latch","layer","lemon","level","light","lilac","linen","lodge","lotus",
  "lunar","maple","marsh","mason","medal","melon","merit","metal","mirth","mocha",
  "model","mound","mulch","noble","north","novel","oasis","ocean","olive","onion",
  "opera","orbit","otter","oxide","panel","patch","peach","pearl","pedal","penny",
  "perch","piano","pilot","pixel","plank","plaza","plume","polar","prism","proud",
  "pulse","quail","query","quiet","quilt","quota","raven","realm","ridge","river",
  "robin","rocky","royal","ruler","rural","sable","salad","satin","scout","serum",
  "shade","shark","shell","shore","sigma","silky","siren","slate","slope","snowy",
  "solar","spark","spear","spice","spine","spoke","spray","stack","stage","stamp",
  "stark","steel","steep","stone","storm","stove","sugar","surge","swift","table",
  "talon","tango","thorn","tiger","timber","toast","topaz","torch","tower","trace",
  "trail","trend","trout","tulip","ultra","umbra","unity","urban","valve","vapor",
  "vault","vigor","vinyl","viola","vivid","vocal","wagon","waltz","watch","water",
  "wheat","widen","winds","witch","woods","yacht","youth","zebra","zones","acorn",
  "amber","anvil","arbor","arrow","atlas","azure",
] as const;

// ─── Password generation ────────────────────────────────────────────────────

export function generatePassword(): string {
  const bytes = randomBytes(6);
  const word1 = WORD_LIST[bytes[0]];
  const word2 = WORD_LIST[bytes[1]];
  const num = ((bytes[2] << 24 | bytes[3] << 16 | bytes[4] << 8 | bytes[5]) >>> 0) % 10000;
  const pin = String(num).padStart(4, "0");
  return `${word1}-${word2}-${pin}`;
}

// ─── Auth config setup ──────────────────────────────────────────────────────

export function createAuthConfig(password?: string): AuthConfig {
  if (password) {
    return { password, generated: false };
  }
  return { password: generatePassword(), generated: true };
}

// ─── Cookie signing ──────────────────────────────────────────────────────────

function sign(payload: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verify(cookie: string): boolean {
  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const payload = cookie.slice(0, dotIndex);
  const sig = cookie.slice(dotIndex + 1);
  const expected = createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function createSessionCookie(): string {
  const payload = JSON.stringify({ created: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  return sign(encoded);
}

export function verifySessionCookie(cookie: string): boolean {
  return verify(cookie);
}

export function getCookieHeader(value: string): string {
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/`;
}

export { COOKIE_NAME };

// ─── Password comparison (constant-time) ─────────────────────────────────────

export function checkPassword(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still run timingSafeEqual to avoid timing leak on length
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateEntry>();

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  let entry = rateLimits.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    rateLimits.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - entry.count,
    retryAfterMs: 0,
  };
}

// Clean up stale entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimits) {
    if (now >= entry.resetAt) rateLimits.delete(ip);
  }
}, 300_000).unref();

// ─── Request helpers ──────────────────────────────────────────────────────────

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  }
  return cookies;
}

export function isAuthenticated(req: Request): boolean {
  const cookies = parseCookies(req.headers.get("cookie"));
  const sessionCookie = cookies[COOKIE_NAME];
  if (!sessionCookie) return false;
  return verifySessionCookie(sessionCookie);
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
