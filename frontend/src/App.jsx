import { useState, useRef, useCallback } from "react";
import "./App.css";

const MAX_FILES = 5;

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [successfulResults, setSuccessfulResults] = useState([]);
  const [failedResults, setFailedResults] = useState([]);
  const [status, setStatus] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("success");
  const fileInputRef = useRef(null);
  const targetLangRef = useRef(null);
  const outputFormatRef = useRef(null);

  const handleFileChange = (files) => {
    const newFiles = Array.from(files);
    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      alert(`Bạn chỉ có thể tải lên tối đa ${MAX_FILES} tệp.`);
      return;
    }
    setSelectedFiles((prevFiles) => [...prevFiles, ...newFiles]);
  };

  const handleFileRemove = (fileName) => {
    setSelectedFiles((prevFiles) =>
      prevFiles.filter((file) => file.name !== fileName)
    );
  };

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileChange(e.dataTransfer.files);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      alert("Vui lòng chọn ít nhất một tệp!");
      return;
    }

    setStatus(`Đang xử lý ${selectedFiles.length} tệp...`);
    setSuccessfulResults([]);
    setFailedResults([]);

    const fd = new FormData();
    selectedFiles.forEach((f) => fd.append("images", f));
    fd.append("targetLang", targetLangRef.current.value);
    fd.append("outputFormat", outputFormatRef.current.value);

    try {
      const res = await fetch("/api/convert-multi", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus(`Lỗi: ${data.error || "Lỗi không xác định"}`);
        return;
      }

      setSuccessfulResults(
        data.success.map((f) => ({
          originalName: f.originalName,
          downloadName: f.filename,
          downloadUrl: `data:${f.mime};base64,${f.outputBase64}`,
        }))
      );
      setFailedResults(data.failed || []);

      setStatus(
        `Hoàn tất ${data.success.length}/${
          selectedFiles.length
        } tệp. Thất bại: ${(data.failed || []).length}.`
      );
    } catch (err) {
      console.error(err);
      setStatus("Lỗi khi gửi yêu cầu.");
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Trình chuyển đổi OCR & Dịch thuật</h1>
        <p>Chuyển đổi và dịch nhiều tệp một cách hiệu quả</p>
      </header>

      <form onSubmit={handleSubmit}>
        <div
          className={`dropzone ${isDragOver ? "drag-over" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current.click()}
        >
          <div className="dropzone-content">
            <p>Kéo và thả tệp vào đây</p>
            <p>hoặc</p>
            <button type="button" className="browse-files-btn">
              Duyệt tệp
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files)}
            multiple
            hidden
            accept="image/*,.pdf"
          />
        </div>

        {selectedFiles.length > 0 && (
          <div className="file-list">
            <h4>Tệp đã chọn:</h4>
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <span>{file.name}</span>
                <button
                  type="button"
                  onClick={() => handleFileRemove(file.name)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="settings-grid">
          <div className="select-box">
            <label htmlFor="target-lang">Ngôn ngữ đích</label>
            <select id="target-lang" ref={targetLangRef}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">Tiếng Anh</option>
              <option value="fr">Tiếng Pháp</option>
              <option value="zh">Tiếng Trung</option>
            </select>
          </div>
          <div className="select-box">
            <label htmlFor="output-format">Định dạng đầu ra</label>
            <select id="output-format" ref={outputFormatRef}>
              <option value="pdf">PDF (.pdf)</option>
              <option value="docx">Word (.docx)</option>
              <option value="txt">Text (.txt)</option>
            </select>
          </div>
        </div>

        <button type="submit" className="submit-btn">
          Chuyển đổi {selectedFiles.length} tệp
        </button>
      </form>

      {status && (
        <div
          className={`status-message ${
            successfulResults.length > 0 ? "success" : "error"
          }`}
        >
          {status}
        </div>
      )}

      {(successfulResults.length > 0 || failedResults.length > 0) && (
        <div className="results-tabs">
          <nav className="tabs-nav">
            <button
              className={`tab-btn ${activeTab === "success" ? "active" : ""}`}
              onClick={() => setActiveTab("success")}
            >
              Thành công ({successfulResults.length})
            </button>
            <button
              className={`tab-btn ${activeTab === "failed" ? "active" : ""}`}
              onClick={() => setActiveTab("failed")}
            >
              Thất bại ({failedResults.length})
            </button>
          </nav>
          <div className="tab-content">
            {activeTab === "success" && (
              <ul className="result-list">
                {successfulResults.map((result, index) => (
                  <li key={index} className="result-item">
                    <span className="file-name">{result.originalName}</span>
                    <a
                      href={result.downloadUrl}
                      download={result.downloadName}
                      className="download-btn"
                    >
                      Tải về
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {activeTab === "failed" && (
              <ul className="result-list">
                {failedResults.map((result, index) => (
                  <li key={index} className="result-item error-item">
                    <span className="file-name">{result.originalName}</span>
                    <span className="error-msg">{result.error}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
