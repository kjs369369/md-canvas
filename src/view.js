import { createExport, loadKoreanFont, triggerDownload } from "./exporter.js";
import { decodeShare } from "./share.js";
import { safeFilename } from "./security.js";

const $ = (selector) => document.querySelector(selector);
const status = $("#viewStatus");

function setStatus(message, tone = "") {
  status.textContent = message || "";
  status.className = tone ? tone : "";
}

function showError(message) {
  $("#viewer").hidden = true;
  $("#viewError").hidden = false;
  $("#viewErrorText").textContent = message;
}

async function download(format) {
  const payload = window.__mdCanvasDoc;
  if (!payload || $("#downloadButtons").dataset.busy === "1") return;
  $("#downloadButtons").dataset.busy = "1";
  setStatus("파일을 만들고 있습니다…");
  try {
    if (format === "PDF") await loadKoreanFont();
    const result = await createExport({ ...payload, format });
    triggerDownload(result.blob, result.filename);
    const label = format === "DOCX" ? "Word" : format;
    setStatus(`${result.filename} ${label} 파일을 저장했습니다. 다운로드가 시작되지 않으면 버튼을 한 번 더 눌러 주세요.`, "good");
  } catch (error) {
    console.error(error);
    setStatus("파일을 만들지 못했습니다. 다시 시도해 주세요.", "bad");
  } finally {
    $("#downloadButtons").dataset.busy = "";
  }
}

async function start() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) {
    showError("열린 문서가 없습니다. MD Canvas에서 변환한 뒤 ‘새 탭에서 보기’ 또는 ‘공유 링크 복사’를 사용해 주세요.");
    return;
  }
  let payload;
  try {
    payload = decodeShare(decodeURIComponent(hash));
  } catch (error) {
    const tooLarge = String(error?.message || "") === "too-large";
    showError(tooLarge
      ? "문서가 너무 커서 이 화면에서 열 수 없습니다."
      : "공유 링크를 읽지 못했습니다. 링크가 잘렸는지 확인해 주세요.");
    return;
  }
  window.__mdCanvasDoc = payload;
  document.title = `${payload.title} — MD Canvas`;
  $("#viewTitle").textContent = payload.title;
  try {
    const preview = await createExport({ ...payload, format: "HTML" });
    $("#resultFrame").srcdoc = preview.previewHtml;
    $("#fileName").textContent = safeFilename(payload.title, "html");
  } catch (error) {
    console.error(error);
    showError("문서를 표시하지 못했습니다. 링크를 다시 열어 주세요.");
    return;
  }
  $("#viewer").hidden = false;
  $("#downloadPdf").addEventListener("click", () => download("PDF"));
  $("#downloadHtml").addEventListener("click", () => download("HTML"));
  $("#downloadDocx").addEventListener("click", () => download("DOCX"));
  $("#copyLink").addEventListener("click", async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("이 화면의 주소를 복사했습니다. 서버에는 문서가 저장되지 않습니다.", "good");
    } catch {
      window.prompt("공유 링크를 복사해 주세요.", url);
    }
  });
}

start();
