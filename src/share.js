import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export const MAX_SHARE_LENGTH = 60000;
const MAX_MARKDOWN_LENGTH = 1_000_000;

export function encodeShare(payload) {
  const compressed = gzipSync(strToU8(JSON.stringify(payload)), { level: 9 });
  return bytesToBase64Url(compressed);
}

export function decodeShare(value) {
  if (!value || typeof value !== "string") throw new Error("empty");
  let data;
  try {
    data = JSON.parse(strFromU8(gunzipSync(base64UrlToBytes(value))));
  } catch {
    throw new Error("invalid");
  }
  if (!data || data.v !== 1 || typeof data.markdown !== "string") throw new Error("invalid");
  if (data.markdown.length > MAX_MARKDOWN_LENGTH) throw new Error("too-large");
  return {
    v: 1,
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 180) : "문서",
    markdown: data.markdown,
    theme: data.theme === "어둡게" ? "어둡게" : "밝게",
    paper: data.paper === "Letter" ? "Letter" : "A4",
    margin: data.margin === "좁게" || data.margin === "넓게" ? data.margin : "보통",
  };
}

function bytesToBase64Url(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
