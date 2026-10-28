import { escapeHtml, safeUrl } from "./security.js";

function isListLine(line) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function isHr(line) {
  return /^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line.trim());
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function isBlockStart(lines, index) {
  const line = lines[index];
  return /^```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^>\s?/.test(line)
    || isListLine(line)
    || isHr(line)
    || isTableStart(lines, index);
}

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function readLink(src, start) {
  if (src[start] !== "[") return null;
  const close = src.indexOf("]", start + 1);
  if (close < 0 || src[close + 1] !== "(") return null;
  const endParen = src.indexOf(")", close + 2);
  if (endParen < 0) return null;
  let dest = src.slice(close + 2, endParen).trim();
  const titled = dest.match(/^(\S+)\s+"[^"]*"$/);
  if (titled) dest = titled[1];
  if (!dest || /\s/.test(dest)) return null;
  return { text: src.slice(start + 1, close), href: dest, end: endParen + 1 };
}

export function parseInlines(input) {
  const src = String(input ?? "");
  const out = [];
  let index = 0;
  let buffer = "";
  const flush = () => {
    if (buffer) {
      out.push({ type: "text", text: buffer });
      buffer = "";
    }
  };
  while (index < src.length) {
    const char = src[index];
    if (char === "\\" && index + 1 < src.length) {
      buffer += src[index + 1];
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = src.indexOf("`", index + 1);
      if (end > index) {
        flush();
        out.push({ type: "code", text: src.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if ((char === "*" || char === "_") && src[index + 1] === char) {
      const marker = char + char;
      const end = src.indexOf(marker, index + 2);
      if (end > index + 1) {
        flush();
        out.push({ type: "strong", children: parseInlines(src.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if (char === "*") {
      const end = src.indexOf("*", index + 1);
      if (end > index + 1) {
        flush();
        out.push({ type: "em", children: parseInlines(src.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    if (char === "!" && src[index + 1] === "[") {
      const image = readLink(src, index + 1);
      if (image && safeUrl(image.href)) {
        flush();
        out.push({ type: "image", alt: image.text, src: image.href });
        index = image.end;
        continue;
      }
    }
    if (char === "[") {
      const link = readLink(src, index);
      if (link && safeUrl(link.href)) {
        flush();
        out.push({ type: "link", href: link.href, children: parseInlines(link.text) });
        index = link.end;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const body = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", lang: fence[1] || "", text: body.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      blocks.push({ type: "heading", level: Math.min(heading[1].length, 3), inlines: parseInlines(heading[2]) });
      index += 1;
      continue;
    }
    if (isHr(line)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", blocks: parseMarkdown(body.join("\n")) });
      continue;
    }
    if (isTableStart(lines, index)) {
      const headers = splitRow(lines[index]).map(parseInlines);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const cells = splitRow(lines[index]).map(parseInlines);
        while (cells.length < headers.length) cells.push([]);
        rows.push(cells.slice(0, headers.length));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (isListLine(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      while (index < lines.length && isListLine(lines[index])) {
        const text = lines[index].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
        const task = text.match(/^\[( |x|X)\]\s*(.*)$/);
        items.push({
          checked: task ? task[1].toLowerCase() === "x" : null,
          inlines: parseInlines(task ? task[2] : text),
        });
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const body = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      body.push(lines[index].trim());
      index += 1;
    }
    const text = body.join(" ");
    const imageOnly = text.match(/^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)$/);
    if (imageOnly) blocks.push({ type: "image", alt: imageOnly[1], src: imageOnly[2] });
    else blocks.push({ type: "paragraph", inlines: parseInlines(text) });
  }
  return blocks;
}

function inlineHtml(nodes) {
  return nodes.map((node) => {
    if (node.type === "text") return escapeHtml(node.text);
    if (node.type === "code") return `<code>${escapeHtml(node.text)}</code>`;
    if (node.type === "strong") return `<strong>${inlineHtml(node.children)}</strong>`;
    if (node.type === "em") return `<em>${inlineHtml(node.children)}</em>`;
    if (node.type === "link") {
      const href = safeUrl(node.href);
      const label = inlineHtml(node.children);
      return href ? `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${label}</a>` : label;
    }
    if (node.type === "image") return imageHtml(node.alt, node.src, null);
    return "";
  }).join("");
}

function imageHtml(alt, src, images) {
  const safeAlt = escapeHtml(alt || "");
  const resolved = images?.get(src);
  const href = resolved?.dataUrl || resolved?.remoteSrc || (!resolved ? safeUrl(src) : null);
  if (!href) return safeAlt ? `<p class="missing-image">${safeAlt}</p>` : "";
  const caption = safeAlt ? `<figcaption>${safeAlt}</figcaption>` : "";
  return `<figure><img src="${escapeHtml(href)}" alt="${safeAlt}">${caption}</figure>`;
}

function blocksToHtml(blocks, images) {
  return blocks.map((block) => {
    if (block.type === "heading") {
      const level = block.level;
      return `<h${level}>${inlineHtml(block.inlines)}</h${level}>`;
    }
    if (block.type === "paragraph") return `<p>${inlineHtml(block.inlines)}</p>`;
    if (block.type === "quote") return `<blockquote>${blocksToHtml(block.blocks, images)}</blockquote>`;
    if (block.type === "code") return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
    if (block.type === "hr") return "<hr>";
    if (block.type === "image") return imageHtml(block.alt, block.src, images);
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items.map((item) => {
        const mark = item.checked == null ? "" : `${item.checked ? "[x] " : "[ ] "}`;
        return `<li>${mark}${inlineHtml(item.inlines)}</li>`;
      }).join("");
      return `<${tag}>${items}</${tag}>`;
    }
    if (block.type === "table") {
      const head = block.headers.map((cell) => `<th>${inlineHtml(cell)}</th>`).join("");
      const body = block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`).join("");
      return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    return "";
  }).join("\n");
}

function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function walkImages(blocks, resolveImage, images) {
  for (const block of blocks) {
    if (block.type === "image" && !images.has(block.src)) {
      images.set(block.src, await inlineImage(block.src, resolveImage));
    }
    if (block.type === "quote") await walkImages(block.blocks, resolveImage, images);
    const groups = [block.inlines, ...(block.headers || []), ...((block.rows || []).flat()), ...((block.items || []).map((item) => item.inlines))];
    for (const group of groups) {
      if (!group) continue;
      for (const node of group) {
        if (node.type === "image" && !images.has(node.src)) images.set(node.src, await inlineImage(node.src, resolveImage));
      }
    }
  }
}

async function inlineImage(src, resolveImage) {
  if (!resolveImage) return null;
  try {
    const resolved = await resolveImage(src);
    if (!resolved) return { missing: true };
    if (resolved.bytes && /^image\/(png|jpeg|gif|webp)$/.test(resolved.mime || "")) {
      const mime = resolved.mime === "image/jpg" ? "image/jpeg" : resolved.mime;
      return { dataUrl: `data:${mime};base64,${bytesToBase64(resolved.bytes)}` };
    }
    if (resolved.remoteSrc && safeUrl(resolved.remoteSrc)) return { remoteSrc: resolved.remoteSrc };
    return { missing: true };
  } catch {
    return { missing: true };
  }
}

export function renderHtmlFragment(markdown) {
  return blocksToHtml(parseMarkdown(markdown), null);
}

export async function renderHtmlFragmentResolved(markdown, resolveImage) {
  const blocks = parseMarkdown(markdown);
  const images = new Map();
  if (resolveImage) await walkImages(blocks, resolveImage, images);
  return blocksToHtml(blocks, images);
}
