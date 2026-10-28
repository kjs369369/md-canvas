import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from "docx";
import { parseMarkdown } from "./markdown.js";
import { imageSize, sniffImage } from "./images.js";
import { safeUrl } from "./security.js";

const FONT = {
  ascii: "Malgun Gothic",
  hAnsi: "Malgun Gothic",
  eastAsia: "Malgun Gothic",
  cs: "Malgun Gothic",
};
const CODE_FONT = {
  ascii: "Consolas",
  hAnsi: "Consolas",
  eastAsia: "Malgun Gothic",
  cs: "Malgun Gothic",
};

const THIN = { style: BorderStyle.SINGLE, size: 4, color: "D2D2D7" };
const BORDERS = {
  top: THIN, bottom: THIN, left: THIN, right: THIN,
  insideHorizontal: THIN, insideVertical: THIN,
};

function palette(theme) {
  const dark = theme === "어둡게";
  return {
    text: dark ? "F5F5F7" : "1D1D1F",
    muted: dark ? "C7C7CC" : "3F3F46",
    link: dark ? "E6D39C" : "755812",
    codeFill: dark ? "2A2A2E" : "F6F3EA",
    headerFill: dark ? "3A3324" : "F8F1DD",
    quote: "B8953F",
  };
}

function pageSetup(paper, margin) {
  const size = paper === "Letter"
    ? { width: 12240, height: 15840 }
    : { width: 11906, height: 16838 };
  const edge = margin === "좁게" ? 720 : margin === "넓게" ? 1440 : 1134;
  return { size, margin: { top: edge, right: edge, bottom: edge, left: edge, header: 360, footer: 560 } };
}

function run(text, options, colors) {
  return new TextRun({
    text: text ?? "",
    font: options.code ? CODE_FONT : FONT,
    size: options.size || 22,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
    color: options.link ? colors.link : colors.text,
    shading: options.code ? { type: ShadingType.CLEAR, fill: colors.codeFill } : undefined,
    underline: options.link ? { type: UnderlineType.SINGLE, color: colors.link } : undefined,
    language: { value: "ko-KR", eastAsia: "ko-KR" },
  });
}

function inlineChildren(nodes, options, colors) {
  const children = [];
  for (const node of nodes || []) {
    if (node.type === "text") children.push(run(node.text, options, colors));
    else if (node.type === "code") children.push(run(node.text, { ...options, code: true, bold: false }, colors));
    else if (node.type === "strong") children.push(...inlineChildren(node.children, { ...options, bold: true }, colors));
    else if (node.type === "em") children.push(...inlineChildren(node.children, { ...options, italics: true }, colors));
    else if (node.type === "link") {
      const href = safeUrl(node.href);
      const label = inlineChildren(node.children, { ...options, link: Boolean(href) }, colors);
      if (!href) children.push(...label);
      else children.push(new ExternalHyperlink({ link: href, children: label }));
    } else if (node.type === "image") children.push(run(node.alt || "이미지", options, colors));
  }
  if (!children.length) children.push(run("", options, colors));
  return children;
}

function paragraph(children, extra = {}) {
  return new Paragraph({ spacing: { before: 80, after: 80 }, ...extra, children });
}

async function imageParagraph(alt, src, resolveImage, colors) {
  const resolved = resolveImage ? await resolveImage(src) : null;
  const mime = resolved?.bytes ? (sniffImage(resolved.bytes) || resolved.mime) : "";
  if (resolved?.bytes && (mime === "image/png" || mime === "image/jpeg" || mime === "image/gif")) {
    const size = imageSize(resolved.bytes);
    const scale = Math.min(1, 620 / Math.max(size.width, 1), 420 / Math.max(size.height, 1));
    const width = Math.max(32, Math.round(size.width * scale));
    const height = Math.max(32, Math.round(size.height * scale));
    const type = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "jpg";
    return [
      new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [new ImageRun({
          type,
          data: resolved.bytes,
          transformation: { width, height },
          altText: { title: alt || "이미지", description: alt || "이미지", name: alt || "image" },
        })],
      }),
      alt ? paragraph([run(alt, { size: 18 }, colors)], { spacing: { before: 0, after: 160 } }) : null,
    ].filter(Boolean);
  }
  const note = alt ? `${alt}${resolved?.remoteSrc ? ` (${resolved.remoteSrc})` : ""}` : "이미지를 불러오지 못했습니다.";
  return [paragraph([run(note, { size: 20 }, colors)])];
}

async function blocksToChildren(blocks, resolveImage, colors, depth = 0, tableWidth = 9360) {
  const children = [];
  for (const block of blocks) {
    if (block.type === "heading") {
      const size = block.level === 1 ? 36 : block.level === 2 ? 28 : 24;
      const heading = block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      children.push(new Paragraph({
        heading,
        spacing: { before: block.level === 1 ? 120 : 280, after: 120 },
        children: inlineChildren(block.inlines, { size, bold: true }, colors),
      }));
    } else if (block.type === "paragraph") {
      children.push(paragraph(inlineChildren(block.inlines, { size: 22 }, colors)));
    } else if (block.type === "quote") {
      const quoted = await blocksToChildren(block.blocks, resolveImage, colors, depth + 1, tableWidth);
      for (const child of quoted) {
        if (child instanceof Paragraph && Array.isArray(child.options.children)) {
          children.push(new Paragraph({
            spacing: child.options.spacing,
            shading: child.options.shading,
            heading: child.options.heading,
            border: { left: { style: BorderStyle.SINGLE, size: 16, color: colors.quote, space: 10 } },
            indent: { left: 280 },
            children: child.options.children,
          }));
        } else children.push(child);
      }
    } else if (block.type === "code") {
      const lines = (block.text || "").split("\n");
      lines.forEach((line, lineIndex) => {
        children.push(new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: colors.codeFill },
          spacing: { before: lineIndex === 0 ? 120 : 0, after: lineIndex === lines.length - 1 ? 120 : 0 },
          children: [run(line.length ? line : " ", { size: 20, code: true }, colors)],
        }));
      });
    } else if (block.type === "hr") {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "D2D2D7", space: 1 } },
        spacing: { before: 120, after: 120 },
        children: [run("", { size: 16 }, colors)],
      }));
    } else if (block.type === "image") {
      children.push(...await imageParagraph(block.alt, block.src, resolveImage, colors));
    } else if (block.type === "list") {
      block.items.forEach((item, itemIndex) => {
        const marker = item.checked != null
          ? `${item.checked ? "[x] " : "[ ] "}`
          : block.ordered ? `${itemIndex + 1}. ` : "• ";
        children.push(paragraph([
          run(marker, { size: 22 }, colors),
          ...inlineChildren(item.inlines, { size: 22 }, colors),
        ], { indent: { left: 420 + depth * 200, hanging: 280 } }));
      });
    } else if (block.type === "table") {
      const columns = Math.max(block.headers.length, 1);
      const width = Math.floor(tableWidth / columns);
      const cell = (inlines, header) => new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: header ? { type: ShadingType.CLEAR, fill: colors.headerFill } : undefined,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: inlineChildren(inlines, { size: 20, bold: header }, colors) })],
      });
      children.push(new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: Array.from({ length: columns }, () => width),
        borders: BORDERS,
        rows: [
          new TableRow({ tableHeader: true, children: block.headers.map((header) => cell(header, true)) }),
          ...block.rows.map((row) => new TableRow({ children: row.map((value) => cell(value, false)) })),
        ],
      }));
      children.push(paragraph([run("", { size: 16 }, colors)], { spacing: { before: 40, after: 40 } }));
    }
  }
  return children;
}

export async function buildDocx({ markdown, title = "문서", paper = "A4", margin = "보통", theme = "밝게", resolveImage }) {
  const colors = palette(theme);
  const setup = pageSetup(paper, margin);
  const tableWidth = setup.size.width - setup.margin.left - setup.margin.right;
  const blocks = parseMarkdown(markdown);
  const children = await blocksToChildren(blocks.length ? blocks : [{ type: "paragraph", inlines: [{ type: "text", text: title || "빈 문서" }] }], resolveImage, colors, 0, tableWidth);
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "6E6E73" }),
        new TextRun({ text: " / ", font: FONT, size: 18, color: "6E6E73" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "6E6E73" }),
      ],
    })],
  });
  const doc = new Document({
    title: title || "문서",
    creator: "MD Canvas",
    description: "MD Canvas에서 변환한 문서",
    background: theme === "어둡게" ? { color: "1D1D1F" } : undefined,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22 },
        },
      },
    },
    sections: [{
      properties: { page: setup },
      footers: { default: footer },
      children,
    }],
  });
  if (typeof window === "undefined") return new Uint8Array(await Packer.toBuffer(doc));
  return new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
}
