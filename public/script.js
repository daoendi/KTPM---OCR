async function extractText() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  if (mode === "client") {
    return runClientOcr();
  } else {
    return runServerPipeline();
  }
}

async function runClientOcr() {
  const file = document.getElementById("file-input").files?.[0];
  if (!file) return alert("Chọn ảnh");

  const img = await loadImage(file);
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  const blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  const thresh = new cv.Mat();
  cv.threshold(blur, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.imshow(canvas, thresh);

  src.delete();
  gray.delete();
  blur.delete();

  const {
    data: { text },
  } = await Tesseract.recognize(
    canvas.toDataURL(),
    document.getElementById("ocr-lang").value
  );
  document.getElementById("text-output").innerText = text;
  thresh.delete();
}

async function runServerPipeline() {
  const file = document.getElementById("file-input").files?.[0];
  if (!file) return alert("Chọn ảnh");

  const fd = new FormData();
  fd.append("image", file);
  fd.append("ocrLang", document.getElementById("ocr-lang").value);
  fd.append("targetLang", document.getElementById("target-lang").value);
  fd.append("docTitle", "Converted-Doc");

  const resp = await fetch("/api/convert", { method: "POST", body: fd });
  if (!resp.ok) return alert("Server error");

  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Converted-Doc.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

document.getElementById("run-btn").addEventListener("click", extractText);

document.getElementById("file-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  const imagePreview = document.getElementById("image-preview");
  const optionsContainer = document.getElementById("options-container");

  if (file) {
    imagePreview.src = URL.createObjectURL(file);
    imagePreview.style.display = "block";
    optionsContainer.style.display = "block";
  } else {
    imagePreview.style.display = "none";
    optionsContainer.style.display = "none";
  }
});
