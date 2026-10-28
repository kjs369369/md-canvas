export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

const DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export function safeUrl(value) {
  const url = String(value ?? "").trim();
  if (!url || /[\u0000-\u001f\s]/.test(url)) return null;
  if (DATA_IMAGE.test(url)) return url.replace(/\s/g, "");
  if (/^(javascript|data|vbscript|file|blob):/i.test(url)) return null;
  if (url.startsWith("//") || url.startsWith("\\\\")) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:[^\s<>"']+$/i.test(url)) return url;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return null;
  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../") || /^[\w./~-]+$/.test(url)) return url;
  return null;
}

export function safeFilename(name, extension) {
  const cleaned = String(name ?? "")
    .replace(/\.(pdf|html|docx)$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const base = cleaned || "문서";
  const ext = String(extension || "txt").replace(/^\./, "").toLowerCase();
  return `${base}.${ext}`;
}
