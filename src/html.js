import { escapeHtml } from "./security.js";
import { renderHtmlFragmentResolved } from "./markdown.js";

const DOCUMENT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #1d1d1f; background: #f5f5f7;
    font-family: "NanumGothic", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif;
    line-height: 1.75;
  }
  article {
    width: min(var(--page-width), calc(100% - 32px));
    margin: 28px auto; padding: var(--page-pad);
    background: #fff; border: 1px solid #e4e4e7; border-radius: 18px;
  }
  h1, h2, h3 { line-height: 1.35; letter-spacing: -.03em; }
  h1 { margin: 0 0 18px; font-size: 32px; }
  h2 { margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #ececf1; font-size: 22px; }
  h3 { margin: 22px 0 8px; font-size: 18px; }
  p, ul, ol { margin: 10px 0; }
  a { color: #755812; }
  code { padding: 1px 5px; border-radius: 5px; background: #f6f3ea; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  pre { overflow: auto; padding: 14px 16px; border-radius: 12px; background: #f6f3ea; }
  pre code { padding: 0; background: transparent; }
  blockquote { margin: 16px 0; padding: 4px 16px; border-left: 4px solid #b8953f; color: #3f3f46; background: #fbf8f1; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { padding: 8px 10px; border: 1px solid #e4e4e7; text-align: left; vertical-align: top; }
  th { background: #f8f1dd; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  figure { margin: 16px 0; }
  figcaption { color: #6e6e73; font-size: 13px; }
  hr { border: 0; border-top: 1px solid #e4e4e7; }
  body.dark { color-scheme: dark; color: #f5f5f7; background: #111113; }
  body.dark article { background: #1d1d1f; border-color: #34343a; }
  body.dark h2 { border-bottom-color: #34343a; }
  body.dark a { color: #e6d39c; }
  body.dark code, body.dark pre { background: #2a2a2e; }
  body.dark blockquote { color: #e7e7ea; background: #26262a; }
  body.dark th, body.dark td { border-color: #3a3a3e; }
  body.dark th { background: #3a3324; }
  body.dark hr { border-top-color: #3a3a3e; }
  @media print {
    body { background: #fff; }
    article { width: auto; margin: 0; border: 0; border-radius: 0; }
    body.dark { background: #1d1d1f; }
  }
`;

export async function buildHtmlDocument({ markdown, title = "문서", theme = "밝게", paper = "A4", margin = "보통", resolveImage }) {
  const article = await renderHtmlFragmentResolved(markdown, resolveImage);
  const pageWidth = paper === "Letter" ? "8.5in" : "210mm";
  const pagePad = margin === "좁게" ? "12mm" : margin === "넓게" ? "24mm" : "18mm";
  const safeTitle = escapeHtml(title || "문서");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>:root { --page-width: ${pageWidth}; --page-pad: ${pagePad}; }${DOCUMENT_CSS}</style>
</head>
<body class="${theme === "어둡게" ? "dark" : "light"}">
  <article>${article}</article>
</body>
</html>
`;
}
