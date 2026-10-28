import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { parseMarkdown } from "./markdown.js";
import { imageSize, sniffImage } from "./images.js";
import { safeUrl } from "./security.js";

function palette(theme) {
  if (theme === "어둡게") {
    return {
      bg: rgb(0.114, 0.114, 0.122),
      text: rgb(0.961, 0.961, 0.969),
      muted: rgb(0.78, 0.78, 0.8),
      link: rgb(0.902, 0.827, 0.612),
      line: rgb(0.35, 0.35, 0.38),
      codeBg: rgb(0.165, 0.165, 0.18),
      headerBg: rgb(0.227, 0.2, 0.141),
      quote: rgb(0.722, 0.584, 0.247),
    };
  }
  return {
    bg: rgb(1, 1, 1),
    text: rgb(0.114, 0.114, 0.122),
    muted: rgb(0.431, 0.431, 0.451),
    link: rgb(0.459, 0.345, 0.071),
    line: rgb(0.824, 0.824, 0.843),
    codeBg: rgb(0.965, 0.953, 0.918),
    headerBg: rgb(0.973, 0.945, 0.867),
    quote: rgb(0.722, 0.584, 0.247),
  };
}

async function transcodeToPng(bytes) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    bitmap.close?.();
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

export async function buildPdf({ markdown, title = "문서", paper = "A4", margin = "보통", theme = "밝게", fontBytes, resolveImage }) {
  if (!fontBytes) throw new Error("font-missing");
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: false });
  const charset = new Set(font.getCharacterSet());
  const colors = palette(theme);
  const pageSize = paper === "Letter" ? [612, 792] : [595.28, 841.89];
  const [pageWidth, pageHeight] = pageSize;
  const marginPt = margin === "좁게" ? 40 : margin === "넓게" ? 80 : 56;
  const bottom = marginPt + 18;
  const contentWidth = pageWidth - marginPt * 2;
  const dark = theme === "어둡게";
  let page;
  let cursor;

  const clean = (text) => {
    let output = "";
    for (const char of String(text ?? "")) {
      const code = char.codePointAt(0);
      if (code === 9) {
        output += "    ";
        continue;
      }
      if (code < 32) continue;
      output += charset.has(code) ? char : "?";
    }
    return output;
  };
  const widthOf = (text, size) => font.widthOfTextAtSize(clean(text) || " ", size);

  function addPage() {
    page = doc.addPage(pageSize);
    if (dark) page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: colors.bg });
    cursor = pageHeight - marginPt;
  }
  function ensure(height) {
    if (cursor - height < bottom) addPage();
  }
  function gap(amount) {
    if (cursor < pageHeight - marginPt - 0.5) {
      ensure(amount);
      cursor -= amount;
    }
  }

  function flatten(nodes, style = {}) {
    const segments = [];
    for (const node of nodes || []) {
      if (node.type === "text") segments.push({ ...style, text: node.text });
      else if (node.type === "code") segments.push({ ...style, code: true, bold: false, text: node.text });
      else if (node.type === "strong") segments.push(...flatten(node.children, { ...style, bold: true }));
      else if (node.type === "em") segments.push(...flatten(node.children, { ...style, italics: true }));
      else if (node.type === "link") segments.push(...flatten(node.children, { ...style, link: safeUrl(node.href) }));
      else if (node.type === "image") segments.push({ ...style, text: node.alt || "" });
    }
    return segments.filter((segment) => segment.text);
  }

  function wrapSegments(segments, maxWidth, size) {
    const lines = [];
    let line = [];
    let used = 0;
    const commit = () => {
      if (line.length) lines.push(line);
      line = [];
      used = 0;
    };
    const append = (segment) => {
      const text = clean(segment.text);
      if (!text) return;
      const pieces = text.split(/(\s+)/);
      for (const piece of pieces) {
        if (!piece) continue;
        const pieceWidth = font.widthOfTextAtSize(piece, size);
        if ((line.length === 0 && /^\s+$/.test(piece))) continue;
        if (used + pieceWidth <= maxWidth || line.length === 0 && pieceWidth <= maxWidth) {
          line.push({ ...segment, text: piece });
          used += pieceWidth;
          continue;
        }
        if (line.length) commit();
        if (pieceWidth <= maxWidth) {
          const trimmed = piece.trimStart();
          if (!trimmed) continue;
          line.push({ ...segment, text: trimmed });
          used = font.widthOfTextAtSize(trimmed, size);
          continue;
        }
        let chunk = "";
        for (const char of piece) {
          const next = chunk + char;
          if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
            line.push({ ...segment, text: chunk });
            commit();
            chunk = char;
          } else chunk = next;
        }
        if (chunk.trim()) {
          line.push({ ...segment, text: chunk });
          used = font.widthOfTextAtSize(chunk, size);
        }
      }
    };
    segments.forEach(append);
    commit();
    return lines.length ? lines : [[]];
  }

  function drawLine(line, x, baseline, size) {
    let current = x;
    for (const segment of line) {
      const text = clean(segment.text);
      if (!text) continue;
      const textWidth = font.widthOfTextAtSize(text, size);
      const color = segment.link ? colors.link : colors.text;
      if (segment.code) {
        page.drawRectangle({
          x: current - 1,
          y: baseline - 3,
          width: textWidth + 2,
          height: size + 6,
          color: colors.codeBg,
        });
      }
      page.drawText(text, { x: current, y: baseline, size, font, color });
      if (segment.bold) page.drawText(text, { x: current + 0.35, y: baseline, size, font, color });
      if (segment.link) {
        page.drawLine({
          start: { x: current, y: baseline - 2 },
          end: { x: current + textWidth, y: baseline - 2 },
          thickness: 0.6,
          color: colors.link,
        });
      }
      current += textWidth;
    }
  }

  function drawInlines(nodes, x, maxWidth, size) {
    const lineHeight = size * 1.55;
    const lines = wrapSegments(flatten(nodes), maxWidth, size);
    for (const line of lines) {
      ensure(lineHeight);
      drawLine(line, x, cursor - size, size);
      cursor -= lineHeight;
    }
  }

  async function drawBlocks(blocks, indent) {
    for (const block of blocks) {
      if (block.type === "heading") {
        const size = block.level === 1 ? 22 : block.level === 2 ? 16 : 13;
        gap(block.level === 1 ? 4 : 12);
        drawInlines(block.inlines.map((node) => node.type === "text" ? node : node), marginPt + indent, contentWidth - indent, size);
        gap(4);
      } else if (block.type === "paragraph") {
        drawInlines(block.inlines, marginPt + indent, contentWidth - indent, 11);
        gap(4);
      } else if (block.type === "quote") {
        const start = cursor;
        await drawBlocks(block.blocks, indent + 14);
        const height = Math.max(8, start - cursor);
        page.drawRectangle({ x: marginPt + indent, y: cursor, width: 3, height, color: colors.quote });
        gap(6);
      } else if (block.type === "code") {
        const size = 10;
        const lineHeight = size * 1.5;
        const pad = 8;
        gap(6);
        for (const raw of (block.text || "").split("\n")) {
          const wrapped = wrapSegments([{ text: raw.length ? raw : " " }], contentWidth - pad * 2, size);
          for (const line of wrapped) {
            ensure(lineHeight);
            page.drawRectangle({
              x: marginPt,
              y: cursor - lineHeight,
              width: contentWidth,
              height: lineHeight,
              color: colors.codeBg,
            });
            drawLine(line, marginPt + pad, cursor - lineHeight + 4, size);
            cursor -= lineHeight;
          }
        }
        gap(8);
      } else if (block.type === "hr") {
        gap(8);
        ensure(8);
        page.drawLine({
          start: { x: marginPt, y: cursor },
          end: { x: marginPt + contentWidth, y: cursor },
          thickness: 0.8,
          color: colors.line,
        });
        gap(8);
      } else if (block.type === "image") {
        await drawImage(block.alt, block.src, indent);
      } else if (block.type === "list") {
        const size = 11;
        block.items.forEach((item, itemIndex) => {
          const marker = item.checked != null ? (item.checked ? "[x] " : "[ ] ") : block.ordered ? `${itemIndex + 1}. ` : "• ";
          const markerWidth = widthOf(marker, size);
          const lines = wrapSegments(flatten(item.inlines), contentWidth - indent - markerWidth, size);
          const lineHeight = size * 1.55;
          lines.forEach((line, lineIndex) => {
            ensure(lineHeight);
            if (lineIndex === 0) drawLine([{ text: marker }], marginPt + indent, cursor - size, size);
            drawLine(line, marginPt + indent + markerWidth, cursor - size, size);
            cursor -= lineHeight;
          });
        });
        gap(4);
      } else if (block.type === "table") {
        await drawTable(block);
      }
    }
  }

  async function drawImage(alt, src, indent) {
    const resolved = resolveImage ? await resolveImage(src) : null;
    let embedded = null;
    if (resolved?.bytes) {
      let bytes = resolved.bytes;
      let mime = sniffImage(bytes) || resolved.mime || "";
      if (mime === "image/webp" || mime === "image/gif") {
        const png = await transcodeToPng(bytes);
        if (png) {
          bytes = png;
          mime = "image/png";
        }
      }
      try {
        if (mime === "image/png") embedded = await doc.embedPng(bytes);
        else if (mime === "image/jpeg") embedded = await doc.embedJpg(bytes);
      } catch {
        embedded = null;
      }
    }
    if (!embedded) {
      drawInlines([{ type: "text", text: alt ? `이미지: ${alt}` : "이미지를 불러오지 못했습니다." }], marginPt + indent, contentWidth - indent, 11);
      gap(6);
      return;
    }
    const natural = imageSize(resolved.bytes);
    const sourceWidth = embedded.width || natural.width;
    const sourceHeight = embedded.height || natural.height;
    const scale = Math.min(contentWidth / sourceWidth, 360 / sourceHeight, 1);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    gap(8);
    ensure(height + 8);
    page.drawImage(embedded, { x: marginPt, y: cursor - height, width, height });
    cursor -= height;
    if (alt) drawInlines([{ type: "text", text: alt }], marginPt, contentWidth, 9);
    gap(8);
  }

  function drawTable(block) {
    const columns = Math.max(block.headers.length, 1);
    const size = 10;
    const lineHeight = size * 1.45;
    const pad = 4;
    const colWidth = contentWidth / columns;
    const cellLines = (nodes) => wrapSegments(flatten(nodes), colWidth - pad * 2, size);
    const rowHeight = (rows) => Math.max(...rows.map((lines) => Math.max(1, lines.length) * lineHeight + pad * 2));
    const paint = (cells, header) => {
      const wrapped = cells.map(cellLines);
      const height = rowHeight(wrapped);
      ensure(height);
      const top = cursor;
      wrapped.forEach((lines, index) => {
        const x = marginPt + index * colWidth;
        page.drawRectangle({
          x,
          y: top - height,
          width: colWidth,
          height,
          color: header ? colors.headerBg : colors.bg,
          borderColor: colors.line,
          borderWidth: 0.7,
        });
        lines.forEach((line, lineIndex) => {
          drawLine(line, x + pad, top - pad - size - lineIndex * lineHeight, size);
        });
      });
      cursor = top - height;
    };
    gap(8);
    paint(block.headers, true);
    for (const row of block.rows) {
      if (cursor - 28 < bottom) {
        addPage();
        paint(block.headers, true);
      }
      paint(row, false);
    }
    gap(8);
  }

  doc.setTitle(clean(title || "문서"));
  doc.setAuthor("MD Canvas");
  doc.setCreator("MD Canvas");
  doc.setLanguage("ko-KR");
  addPage();
  const blocks = parseMarkdown(markdown);
  if (!blocks.length) drawInlines([{ type: "text", text: title || "빈 문서" }], marginPt, contentWidth, 16);
  else await drawBlocks(blocks, 0);

  const pages = doc.getPages();
  pages.forEach((item, index) => {
    const label = clean(`${index + 1} / ${pages.length}`);
    const labelWidth = font.widthOfTextAtSize(label, 9);
    item.drawText(label, { x: (pageWidth - labelWidth) / 2, y: 22, size: 9, font, color: colors.muted });
  });
  return doc.save();
}
