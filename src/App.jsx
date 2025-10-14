import { useState, useRef } from "react";

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef(null);
  const targetLangRef = useRef(null);
  const outputFormatRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 10) {
      alert("Bạn chỉ có thể chọn tối đa 10 file.");
      e.target.value = null; // Reset input
      setSelectedFiles([]);
      return;
    }
    setSelectedFiles(files);
    setResults([]); // Clear previous results
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      alert("Vui lòng chọn ít nhất một file!");
      return;
    }

    setStatus(`Đang xử lý ${selectedFiles.length} file...`);
    setResults([]); // Clear previous results before starting

    const newResults = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setStatus(
        `Đang xử lý file ${i + 1}/${selectedFiles.length}: ${file.name}`
      );

      const fd = new FormData();
      fd.append("image", file);
      fd.append("targetLang", targetLangRef.current.value);
      fd.append("outputFormat", outputFormatRef.current.value);
      // Use original filename as the base for the output document title
      const originalFileName = file.name.substring(
        0,
        file.name.lastIndexOf(".")
      );
      fd.append("docTitle", originalFileName);

      try {
        const res = await fetch("/api/convert", { method: "POST", body: fd });

        if (!res.ok) {
          const err = await res.json();
          newResults.push({
            originalName: file.name,
            error: `Lỗi: ${err.error || "Không rõ"}`,
          });
          continue; // Move to the next file
        }

        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition");
        let filename = "output";
        if (cd && cd.includes("filename=")) {
          filename = cd.split("filename=")[1].replace(/"/g, "");
        }

        const url = window.URL.createObjectURL(blob);
        newResults.push({
          originalName: file.name,
          downloadUrl: url,
          downloadName: filename,
        });
      } catch (err) {
        console.error(err);
        newResults.push({
          originalName: file.name,
          error: "Lỗi khi gửi yêu cầu.",
        });
      } finally {
        // Update results progressively
        setResults([...newResults]);
      }
    }

    setStatus(`Hoàn tất xử lý ${selectedFiles.length} file.`);
  };

  return (
    <div className="container">
      <h1>Trích xuất và Dịch văn bản (Hàng loạt)</h1>
      <form id="upload-form" onSubmit={handleSubmit}>
        <div className="option-group">
          <h3>1. Chọn file ảnh hoặc PDF (tối đa 10 file)</h3>
          <input
            type="file"
            id="image"
            name="image"
            accept="image/*,.pdf"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple // Allow multiple files
          />
        </div>

        <div className="option-group">
          <h3>2. Chọn ngôn ngữ đích</h3>
          <select id="target-lang" name="targetLang" ref={targetLangRef}>
            <option value="vie">Tiếng Việt</option>
            <option value="eng">Tiếng Anh</option>
            {/* Thêm các ngôn ngữ khác nếu cần */}
          </select>
        </div>

        <div className="option-group">
          <h3>3. Chọn định dạng đầu ra</h3>
          <select id="output-format" name="outputFormat" ref={outputFormatRef}>
            <option value="txt">Text (.txt)</option>
            <option value="docx">Word (.docx)</option>
            <option value="pdf">PDF (.pdf)</option>
          </select>
        </div>

        <button type="submit">Chuyển đổi</button>
      </form>
      <div id="status">{status}</div>

      {results.length > 0 && (
        <div className="results-container">
          <h3>Kết quả:</h3>
          <ul>
            {results.map((result, index) => (
              <li key={index}>
                <span>{result.originalName}</span>
                {result.downloadUrl ? (
                  <a
                    href={result.downloadUrl}
                    download={result.downloadName}
                    className="download-btn"
                  >
                    Tải về
                  </a>
                ) : (
                  <span className="error-msg">{result.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default App;
