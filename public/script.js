document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fileInput = document.getElementById("image");
  if (!fileInput.files.length) {
    alert("Vui lòng chọn file ảnh!");
    return;
  }

  const statusDiv = document.getElementById("status");
  statusDiv.innerText = "Đang xử lý...";

  const fd = new FormData();
  fd.append("image", fileInput.files[0]);
  fd.append("targetLang", document.getElementById("target-lang").value);
  fd.append("outputFormat", document.getElementById("output-format").value);
  fd.append("docTitle", document.getElementById("doc-title").value);

  try {
    const res = await fetch("/api/convert", { method: "POST", body: fd });

    if (!res.ok) {
      const err = await res.json();
      statusDiv.innerText = "Lỗi: " + (err.error || "Không rõ");
      return;
    }

    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition");
    let filename = "output";
    if (cd && cd.includes("filename=")) {
      filename = cd.split("filename=")[1].replace(/"/g, "");
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    statusDiv.innerText = "✅ Hoàn tất! File đã được tải về.";
  } catch (err) {
    console.error(err);
    statusDiv.innerText = "Lỗi khi gửi yêu cầu.";
  }
});
