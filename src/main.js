import { renderHtmlFragment } from "./markdown.js";

const sample = `# 생성형 AI 실전 강의안

> 비전문가도 90분 안에 AI 활용 결과물을 완성하는 실습형 강의입니다.

## 학습 목표

- 생성형 AI의 핵심 개념 이해
- 좋은 질문을 만드는 프롬프트 구조 익히기
- 업무에 바로 쓰는 결과물 완성

## 오늘의 실습

1. AI에게 역할과 대상을 알려줍니다.
2. 원하는 결과 형식을 구체적으로 정합니다.
3. 첫 결과를 검토하고 개선 요청을 합니다.

\`핵심: 작게 시작하고 결과를 보며 수정합니다.\`

## 실습 표

| 단계 | 내용 |
| --- | --- |
| 1 | 역할과 대상을 알려줍니다 |
| 2 | 결과 형식을 정합니다 |

## 예시 코드

\`\`\`text
const 안내 = "한글 코드";
console.log(안내);
\`\`\`

## 참고 이미지

![MD Canvas 로고](og.png)

자세한 안내는 [MD Canvas](https://md-canvas-aiclab.vercel.app/)에서 확인합니다.`;

const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll(".screen")];
const show = (id) => {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
};

let selectedFormat = "PDF";
let exporting = false;
let lastResult = null;
const retainedUrls = [];

function formatLabel(format) {
  if (format === "DOCX") return "Word 문서";
  return format;
}

function formatBytes(size) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function retainUrl(url) {
  retainedUrls.push(url);
  while (retainedUrls.length > 6) URL.revokeObjectURL(retainedUrls.shift());
  return url;
}

function setStatus(message, tone = "") {
  const status = $("#exportMessage");
  status.textContent = message || "";
  status.className = `export-message${tone ? ` ${tone}` : ""}`;
}

function loadDocument(text, name = "AI_강의안.md") {
  $("#source").value = text;
  $("#documentName").textContent = name;
  $("#exportName").value = name.replace(/\.(md|markdown|txt)$/i, "");
  updatePreview();
  show("workspaceScreen");
}

function updatePreview() {
  const text = $("#source").value;
  $("#preview").innerHTML = renderHtmlFragment(text);
  $("#lineCount").textContent = `${text.split("\n").length}줄`;
}

function handleFile(file) {
  $("#fileError").textContent = "";
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name)) {
    $("#fileError").textContent = "Markdown 또는 텍스트 파일을 선택해 주세요.";
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    $("#fileError").textContent = `현재 파일은 ${(file.size / 1024 / 1024).toFixed(1)}MB입니다. 최대 20MB까지 열 수 있습니다.`;
    return;
  }
  const reader = new FileReader();
  reader.onload = () => loadDocument(String(reader.result), file.name);
  reader.onerror = () => { $("#fileError").textContent = "파일을 읽지 못했습니다. UTF-8 형식인지 확인해 주세요."; };
  reader.readAsText(file, "UTF-8");
}

function buttonLabel() {
  return selectedFormat === "DOCX" ? "Word 문서로 저장" : `${selectedFormat}로 저장`;
}

function showResult(result) {
  const downloadUrl = retainUrl(URL.createObjectURL(result.blob));
  const htmlUrl = retainUrl(URL.createObjectURL(new Blob([result.previewHtml], { type: "text/html;charset=utf-8" })));
  $("#completeFormat").textContent = formatLabel(result.format);
  $("#completeFile").textContent = `${result.filename} · ${formatBytes(result.blob.size)}`;
  const frame = $("#resultFrame");
  frame.removeAttribute("src");
  frame.setAttribute("sandbox", "allow-same-origin");
  frame.srcdoc = result.previewHtml;
  const download = $("#downloadLink");
  download.href = downloadUrl;
  download.download = result.filename;
  download.textContent = "파일 다운로드";
  const openView = $("#openViewLink");
  openView.href = result.viewUrl || htmlUrl;
  openView.target = "_blank";
  $("#copyViewLink").disabled = !result.viewUrl;
  $("#copyViewLink").dataset.url = result.viewUrl || "";
  const imageNote = result.missedImages
    ? " 일부 이미지는 불러오지 못해 파일에 넣지 못했습니다."
    : "";
  const shareNote = result.viewUrl
    ? ""
    : " 문서가 길어 공유 링크는 만들 수 없습니다.";
  const docxNote = result.format === "DOCX"
    ? " 아래는 Word 파일에 들어갈 내용입니다."
    : "";
  setStatus(`${result.filename} 파일을 저장했습니다. 다운로드가 시작되지 않으면 ‘파일 다운로드’를 눌러 주세요.${docxNote}${imageNote}${shareNote}`, "good");
  show("completeScreen");
  const auto = document.createElement("a");
  auto.href = downloadUrl;
  auto.download = result.filename;
  auto.target = "_blank";
  auto.rel = "noopener";
  document.body.appendChild(auto);
  auto.click();
  auto.remove();
}

async function confirmExport() {
  if (exporting) return;
  exporting = true;
  const button = $("#confirmExport");
  button.disabled = true;
  button.textContent = "변환 중…";
  $("#exportStatus").textContent = "문서를 변환하고 있습니다…";
  try {
    const { createExport } = await import("./exporter.js");
    const title = $("#exportName").value.trim() || "문서";
    lastResult = await createExport({
      markdown: $("#source").value,
      title,
      format: selectedFormat,
      paper: $("#paperSize").value,
      margin: $("#marginSize").value,
      theme: $("#theme").value,
    });
    $("#exportStatus").textContent = "";
    setOverlay(false);
    showResult(lastResult);
  } catch (error) {
    console.error(error);
    const fontError = String(error?.message || "").includes("font");
    $("#exportStatus").textContent = fontError
      ? "PDF에 필요한 글꼴을 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요."
      : "파일을 만들지 못했습니다. 내용을 확인한 뒤 다시 시도해 주세요.";
  } finally {
    exporting = false;
    button.disabled = false;
    button.textContent = buttonLabel();
  }
}

const openPicker = () => $("#fileInput").click();
$("#chooseFile").addEventListener("click", (event) => { event.stopPropagation(); openPicker(); });
$("#heroOpen").addEventListener("click", openPicker);
$("#navOpen").addEventListener("click", () => show("startScreen"));
document.querySelectorAll("[data-scroll]").forEach((button) => button.addEventListener("click", () => {
  show("startScreen");
  requestAnimationFrame(() => document.getElementById(button.dataset.scroll).scrollIntoView({ behavior: "smooth" }));
}));
$("#dropzone").addEventListener("click", openPicker);
$("#dropzone").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); }
});
$("#fileInput").addEventListener("change", (event) => handleFile(event.target.files[0]));
["dragenter", "dragover"].forEach((name) => $("#dropzone").addEventListener(name, (event) => {
  event.preventDefault(); $("#dropzone").classList.add("drag");
}));
["dragleave", "drop"].forEach((name) => $("#dropzone").addEventListener(name, (event) => {
  event.preventDefault(); $("#dropzone").classList.remove("drag");
}));
$("#dropzone").addEventListener("drop", (event) => handleFile(event.dataTransfer.files[0]));
$("#sampleButton").addEventListener("click", () => loadDocument(sample));
$("#source").addEventListener("input", updatePreview);
$("#newFile").addEventListener("click", () => show("startScreen"));

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  const mode = button.dataset.view;
  $("#workspace").classList.toggle("show-source", mode === "source");
  document.querySelector(".source-pane").style.display = mode === "preview" ? "none" : "";
  document.querySelector(".preview-pane").style.display = mode === "source" ? "none" : "";
  document.querySelector(".rail").style.display = mode === "split" ? "" : "none";
  document.querySelector(".editor-grid").style.gridTemplateColumns = mode === "split" ? "" : "1fr";
}));

const setOverlay = (open) => {
  $("#exportOverlay").classList.toggle("active", open);
  $("#exportOverlay").setAttribute("aria-hidden", String(!open));
  if (open) {
    $("#exportStatus").textContent = "";
    $("#closeExport").focus();
  }
};
$("#exportButton").addEventListener("click", () => setOverlay(true));
$("#closeExport").addEventListener("click", () => setOverlay(false));
$("#cancelExport").addEventListener("click", () => setOverlay(false));
$("#exportOverlay").addEventListener("click", (event) => { if (event.target === $("#exportOverlay")) setOverlay(false); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !exporting) setOverlay(false); });

document.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => {
  selectedFormat = button.dataset.format;
  document.querySelectorAll("[data-format]").forEach((item) => item.classList.toggle("active", item === button));
  $("#confirmExport").textContent = buttonLabel();
  $("#estimate").textContent = selectedFormat === "PDF" ? "예상 결과: PDF 약 2쪽" : `예상 결과: ${selectedFormat} 파일 1개`;
}));
$("#confirmExport").addEventListener("click", confirmExport);
$("#backToDocument").addEventListener("click", () => show("workspaceScreen"));
$("#saveAgain").addEventListener("click", () => {
  if (!lastResult) return;
  const link = $("#downloadLink");
  const auto = document.createElement("a");
  auto.href = link.href;
  auto.download = lastResult.filename;
  auto.rel = "noopener";
  document.body.appendChild(auto);
  auto.click();
  auto.remove();
  setStatus(`${lastResult.filename} 파일을 다시 저장했습니다.`, "good");
});
$("#openNew").addEventListener("click", () => show("startScreen"));
$("#copyViewLink").addEventListener("click", async () => {
  const url = $("#copyViewLink").dataset.url;
  if (!url) {
    setStatus("문서가 길어 공유 링크는 만들 수 없습니다. 새 탭에서 보기는 이 브라우저에서만 열립니다.", "bad");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("공유 링크를 복사했습니다. 주소 안에 문서 내용이 들어 있으며 서버에는 저장되지 않습니다.", "good");
  } catch {
    window.prompt("공유 링크를 복사해 주세요.", url);
  }
});

$("#downloadLink").addEventListener("click", () => {
  if (lastResult) setStatus(`${lastResult.filename} 파일을 저장했습니다.`, "good");
});

loadDocument(sample);
show("startScreen");
