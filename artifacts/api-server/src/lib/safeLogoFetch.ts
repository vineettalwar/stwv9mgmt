import { URL } from "url";

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1$|fc00:|fd)/;

function isSafeLogoUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (PRIVATE_IP_RE.test(parsed.hostname)) return false;
  if (parsed.hostname === "localhost") return false;
  return true;
}

const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"];
const LOGO_SIZE_LIMIT = 1024 * 512; // 512 KB

export async function safeLogoFetch(logoUrl: string): Promise<Buffer | null> {
  if (!isSafeLogoUrl(logoUrl)) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(logoUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ALLOWED_CONTENT_TYPES.some(t => ct.startsWith(t))) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > LOGO_SIZE_LIMIT) return null;
    return buf;
  } catch {
    return null;
  }
}
