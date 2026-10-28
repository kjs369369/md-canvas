import { buildHtmlDocument } from "./html.js";
import { buildDocx } from "./docx.js";
import { buildPdf } from "./pdf.js";
import { encodeShare, MAX_SHARE_LENGTH } from "./share.js";
import { safeFilename } from "./security.js";
import { memoResolve, resolveImage } from "./images.js";

const MIME = {
  PDF: "application/pdf",
  HTML: "text/html;charset=utf-8",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

let fontPromise;

export function loadKoreanFont() {
  if (!fontPromise) {
    const href = new URL("fonts/NanumGothic-Regular.ttf", document.baseURI).href;
    fontPromise = fetch(href).then((response) => {
      if (!response.ok) throw new Error("font-missing");
      return response.arrayBuffer();
    });
  }
  return fontPromise;
}

export async function createExport({ markdown, title, format, paper, margin, theme }) {
  const resolver = memoResolve(resolveImage);
  const counted = new Set();
  let missed = 0;
  const trackedResolve = async (url) => {
    const resolved = await resolver(url);
    if (!counted.has(url)) {
      counted.add(url);
      const embedded = Boolean(resolved?.bytes);
      const visible = Boolean(resolved?.remoteSrc);
      if (!embedded && !(format === "HTML" && visible)) missed += 1;
    }
    return resolved;
  };
  const previewHtml = await buildHtmlDocument({
    markdown, title, theme, paper, margin, resolveImage: trackedResolve,
  });
  const extension = format === "DOCX" ? "docx" : format.toLowerCase();
  const filename = safeFilename(title, extension);
  let bytes;
  if (format === "HTML") bytes = new TextEncoder().encode(previewHtml);
  else if (format === "DOCX") bytes = await buildDocx({ markdown, title, paper, margin, theme, resolveImage: trackedResolve });
  else bytes = await buildPdf({ markdown, title, paper, margin, theme, fontBytes: await loadKoreanFont(), resolveImage: trackedResolve });
  const share = encodeShare({ v: 1, title, markdown, theme, paper, margin });
  const viewUrl = share.length <= MAX_SHARE_LENGTH
    ? new URL(`view.html#${share}`, document.baseURI).href
    : "";
  return {
    blob: new Blob([bytes], { type: MIME[format] || "application/octet-stream" }),
    filename,
    previewHtml,
    viewUrl,
    missedImages: missed,
    format,
  };
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return url;
}
