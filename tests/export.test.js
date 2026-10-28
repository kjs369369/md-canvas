import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { buildDocx } from "../src/docx.js";
import { buildHtmlDocument } from "../src/html.js";
import { parseMarkdown, renderHtmlFragment } from "../src/markdown.js";
import { buildPdf } from "../src/pdf.js";
import { safeFilename, safeUrl } from "../src/security.js";
import { decodeShare, encodeShare } from "../src/share.js";

const sample = `# 생성형 AI 실전 강의안

한글 문장입니다.

## 학습 목표

- 핵심 개념 이해

| 단계 | 내용 |
| --- | --- |
| 1 | 역할과 대상을 알려줍니다 |

\`\`\`text
const 안내 = "한글 코드";
\`\`\`

![MD Canvas 로고](og.png)

[안전한 링크](https://md-canvas-aiclab.vercel.app/)
`;

const hostile = `안녕 <script>alert(1)</script>

[클릭](javascript:alert(1))

![함정](javascript:alert(1))

<img src=x onerror=alert(1)>
`;

async function readPng() {
  const bytes = new Uint8Array(await readFile(new URL("../prototype/og.png", import.meta.url)));
  return { bytes, mime: "image/png" };
}

const resolveImage = async (url) => (url.endsWith("og.png") ? readPng() : null);

test("markdown keeps headings, Korean, tables, code, and images", () => {
  const blocks = parseMarkdown(sample);
  assert.equal(blocks[0].type, "heading");
  assert.match(renderHtmlFragment(sample), /<h1>생성형 AI 실전 강의안<\/h1>/);
  assert.match(renderHtmlFragment(sample), /<table>/);
  assert.match(renderHtmlFragment(sample), /역할과 대상/);
  assert.match(renderHtmlFragment(sample), /<pre><code>const 안내 = &quot;한글 코드&quot;/);
  assert.match(renderHtmlFragment(sample), /<img src="og.png" alt="MD Canvas 로고">/);
  assert.match(renderHtmlFragment(sample), /href="https:\/\/md-canvas-aiclab.vercel.app\/"/);
});

test("markdown escapes active content and unsafe urls", () => {
  const html = renderHtmlFragment(hostile);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /<[a-z][^>]*onerror/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /src="javascript:/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /함정/);
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://example.com/가"), "https://example.com/가");
});

test("filenames keep Korean names and force the extension", () => {
  assert.equal(safeFilename("AI/강의안", "pdf"), "AI 강의안.pdf");
  assert.equal(safeFilename("   ", "docx"), "문서.docx");
  assert.equal(safeFilename("노트.html", "html"), "노트.html");
});

test("share links round-trip Korean markdown without putting it in a query string", () => {
  const encoded = encodeShare({ v: 1, title: "강의안", markdown: sample, theme: "밝게", paper: "A4", margin: "보통" });
  assert.ok(encoded.length < 60000);
  assert.doesNotMatch(encoded, /[+/=]/);
  const decoded = decodeShare(encoded);
  assert.equal(decoded.markdown, sample);
  assert.equal(decoded.title, "강의안");
});

test("html export is a standalone sanitized document", async () => {
  const html = await buildHtmlDocument({
    markdown: `${sample}\n\n${hostile}`,
    title: "강의안 <script>",
    theme: "밝게",
    paper: "A4",
    margin: "보통",
    resolveImage,
  });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /charset="utf-8"/);
  assert.match(html, /<title>강의안 &lt;script&gt;<\/title>/);
  assert.match(html, /한글 코드/);
  assert.match(html, /data:image\/png;base64,/);
  const article = html.slice(html.indexOf("<article>"), html.indexOf("</article>")).replace(/src="data:image[^"]+"/g, 'src=""');
  assert.doesNotMatch(article, /<script/i);
  assert.doesNotMatch(article, /<[a-z][^>]*onerror/i);
  assert.doesNotMatch(article, /href="javascript:/i);
  assert.doesNotMatch(article, /src="javascript:/i);
});

test("docx export opens as a word package with Korean text, a table, and an image", async () => {
  const bytes = await buildDocx({
    markdown: sample,
    title: "생성형 AI 실전 강의안",
    paper: "A4",
    margin: "보통",
    theme: "밝게",
    resolveImage,
  });
  const files = unzipSync(bytes);
  const xml = strFromU8(files["word/document.xml"]);
  assert.match(xml, /생성형 AI 실전 강의안/);
  assert.match(xml, /한글 코드/);
  assert.match(xml, /역할과 대상을 알려줍니다/);
  assert.match(xml, /<w:tbl/);
  assert.match(xml, /Malgun Gothic/);
  assert.ok(Object.keys(files).some((name) => name.startsWith("word/media/")));
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
});

test("pdf export embeds Korean text and the image", async () => {
  const fontBytes = await readFile(new URL("../prototype/fonts/NanumGothic-Regular.ttf", import.meta.url));
  const bytes = await buildPdf({
    markdown: sample,
    title: "생성형 AI 실전 강의안",
    paper: "A4",
    margin: "보통",
    theme: "밝게",
    fontBytes,
    resolveImage,
  });
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 1);
  assert.equal(doc.getTitle(), "생성형 AI 실전 강의안");
  const raw = Buffer.from(bytes).toString("latin1");
  assert.match(raw, /\/Subtype\s*\/Image/);

  const probe = spawnSync("python3", ["-c", "import pymupdf"], { encoding: "utf8" });
  if (probe.status !== 0) return;
  const dir = await mkdtemp(join(tmpdir(), "md-canvas-"));
  const pdfPath = join(dir, "sample.pdf");
  await writeFile(pdfPath, bytes);
  const extracted = spawnSync("python3", ["-c", `
import pymupdf, sys
doc = pymupdf.open(sys.argv[1])
print("".join(page.get_text() for page in doc))
print("IMAGES", sum(len(page.get_images()) for page in doc))
`, pdfPath], { encoding: "utf8" });
  await rm(dir, { recursive: true, force: true });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.match(extracted.stdout, /생성형 AI 실전 강의안/);
  assert.match(extracted.stdout, /한글 코드/);
  assert.match(extracted.stdout, /역할과 대상/);
  assert.match(extracted.stdout, /IMAGES [1-9]/);
});
