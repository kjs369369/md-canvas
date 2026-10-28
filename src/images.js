import { safeUrl } from "./security.js";

export function sniffImage(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "image/gif";
  if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[8] === 0x57 && data[9] === 0x45) return "image/webp";
  return "";
}

export function imageSize(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (sniffImage(data) === "image/png" && data.length >= 24) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (sniffImage(data) === "image/jpeg") {
    let index = 2;
    while (index < data.length - 8) {
      if (data[index] !== 0xff) {
        index += 1;
        continue;
      }
      const marker = data[index + 1];
      const length = (data[index + 2] << 8) + data[index + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: (data[index + 5] << 8) + data[index + 6],
          width: (data[index + 7] << 8) + data[index + 8],
        };
      }
      if (!length) break;
      index += 2 + length;
    }
  }
  return { width: 640, height: 360 };
}

function parseDataImage(url) {
  const match = String(url).match(/^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  return { bytes, mime: sniffImage(bytes) || mime };
}

export async function resolveImage(url) {
  const safe = safeUrl(url);
  if (!safe) return null;
  if (safe.startsWith("data:image/")) return parseDataImage(safe);
  if (typeof fetch !== "function") return { remoteSrc: safe };
  try {
    const base = typeof location !== "undefined" ? location.href : "http://localhost/";
    const absolute = new URL(safe, base);
    if (absolute.protocol !== "https:" && absolute.protocol !== "http:") return null;
    const response = await fetch(absolute.href);
    if (!response.ok) return { remoteSrc: safe };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const header = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const mime = sniffImage(bytes) || header;
    if (/^image\/(png|jpeg|gif|webp)$/.test(mime)) return { bytes, mime };
    return { remoteSrc: safe };
  } catch {
    return /^https?:\/\//i.test(safe) ? { remoteSrc: safe } : null;
  }
}

export function memoResolve(resolveImage) {
  const cache = new Map();
  return async (url) => {
    const key = String(url ?? "");
    if (cache.has(key)) return cache.get(key);
    const resolved = await resolveImage(key);
    cache.set(key, resolved);
    return resolved;
  };
}
