import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";
import FileDropzone from "./components/FileDropzone";
import ModeToggle from "./components/ModeToggle";
import CacheStatsPanel from "./components/CacheStatsPanel";
const ACTIVE_JOB_STATES = new Set([
  "waiting",
  "active",
  "delayed",
  "paused",
  "stalled",
  "repeat",
  "queued",
  "prioritized",
]);

const isJobInFlight = (state) => {
  if (!state) return true;
  return ACTIVE_JOB_STATES.has(state);
};

const isNetworkError = (error) => {
  if (!error) return false;
  if (error.name === "TypeError") return true;
  const msg = String(error.message || "");
  return /Failed to fetch|ECONNREFUSED|ECONNRESET|NetworkError/.test(msg);
};

function App() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [successfulResults, setSuccessfulResults] = useState([]);
  const [failedResults, setFailedResults] = useState([]);
  const [processingList, setProcessingList] = useState([]);
  const [status, setStatus] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("success");
  const [processingMode, setProcessingMode] = useState("sync");
  const [jobs, setJobs] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [apiError, setApiError] = useState("");
  const fileInputRef = useRef(null);
  const targetLangRef = useRef(null);
  const outputFormatRef = useRef(null);
  const jobsRef = useRef([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [ocrHistory, setOcrHistory] = useState([]);

  const markApiOffline = useCallback((message = "") => {
    setApiOnline(false);
    if (message) setApiError(message);
  }, []);

  const markApiOnline = useCallback(() => {
    setApiOnline(true);
    setApiError("");
  }, []);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const fetchHistory = useCallback(
    async (options = {}) => {
      const { force = false } = options;
      if (!apiOnline && !force) return;
      try {
        const res = await fetch("/api/ocr-history?limit=20");
        if (!res.ok) return;
        const data = await res.json();
        setOcrHistory(data);
        markApiOnline();
      } catch (e) {
        if (isNetworkError(e)) {
          markApiOffline("Không thể kết nối API khi lấy lịch sử OCR.");
        } else {
          console.error("Failed to fetch history", e);
        }
      }
    },
    [apiOnline, markApiOffline, markApiOnline]
  );

  const fetchCacheStats = useCallback(
    async (options = {}) => {
      const { force = false } = options;
      if (!apiOnline && !force) return;
      try {
        const res = await fetch("/api/cache-stats");
        if (!res.ok) return;
        const data = await res.json();
        setCacheStats(data);
        markApiOnline();
      } catch (e) {
        if (isNetworkError(e)) {
          markApiOffline("Không thể kết nối API khi lấy cache stats.");
        } else {
          console.error("Failed to fetch cache stats", e);
        }
      }
    },
    [apiOnline, markApiOffline, markApiOnline]
  );

  // Tự động cập nhật lịch sử mỗi 5 giây
  useEffect(() => {
    if (!apiOnline) return;
    fetchHistory({ force: true });
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, [apiOnline, fetchHistory]);

  useEffect(() => {
    if (!apiOnline) return;
    fetchCacheStats({ force: true });
    const interval = setInterval(fetchCacheStats, 15000);
    return () => clearInterval(interval);
  }, [apiOnline, fetchCacheStats]);

  const handleFileChange = (files) => {
    const newFiles = Array.from(files);
    // Allow unlimited files from the client side; server will handle processing
    setSelectedFiles((prevFiles) => [...prevFiles, ...newFiles]);
  };

  const handleFileRemove = (fileName) => {
    setSelectedFiles((prevFiles) =>
      prevFiles.filter((file) => file.name !== fileName)
    );
  };

  // drag state handled inside FileDropzone component

  const updateJobFromServer = useCallback(
    async (job, options = {}) => {
      const { force = false } = options;
      if (!job) return;
      if (!force && !apiOnline) return;
      try {
        const res = await fetch(`/api/job/${job.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        let shouldRefreshHistory = false;
        setJobs((prev) =>
          prev.map((item) => {
            if (item.jobId !== job.jobId) return item;
            if (item.state !== "completed" && data.state === "completed") {
              shouldRefreshHistory = true;
            }
            return {
              ...item,
              state: data.state,
              progress:
                typeof data.progress === "number"
                  ? data.progress
                  : item.progress,
              result: data.result || item.result,
            };
          })
        );
        // Move job from processing -> success/failed when state transitions
        try {
          if (data.state === "completed") {
            // find originalName from jobsRef
            const matching = jobsRef.current.find((j) => j.jobId === job.jobId);
            const originalName = matching?.originalName || `Job ${job.jobId}`;
            // add to successfulResults if not already present
            setSuccessfulResults((prev) => {
              const exists = prev.some(
                (p) =>
                  p.originalName === originalName &&
                  p.downloadName === (data.result?.filename || "")
              );
              if (exists) return prev;
              const newItem = {
                originalName,
                downloadName: data.result?.filename,
                downloadUrl: data.result?.outputBase64
                  ? `data:${data.result.mime};base64,${data.result.outputBase64}`
                  : null,
              };
              return [newItem, ...prev];
            });
            setProcessingList((prev) =>
              prev.filter((p) => p.jobId !== job.jobId)
            );
          } else if (data.state === "failed") {
            const matching = jobsRef.current.find((j) => j.jobId === job.jobId);
            const originalName = matching?.originalName || `Job ${job.jobId}`;
            setFailedResults((prev) => {
              const exists = prev.some((f) => f.originalName === originalName);
              if (exists) return prev;
              return [
                { originalName, error: data?.error || "Failed" },
                ...prev,
              ];
            });
            setProcessingList((prev) =>
              prev.filter((p) => p.jobId !== job.jobId)
            );
          }
        } catch (e) {
          console.error("Error moving job between lists:", e);
        }
        if (shouldRefreshHistory) {
          fetchHistory();
        }
        markApiOnline();
      } catch (err) {
        if (isNetworkError(err)) {
          markApiOffline("Không thể kết nối API khi lấy trạng thái job.");
        } else {
          console.error(`Failed to refresh job ${job.jobId}`, err);
        }
      }
    },
    [apiOnline, fetchHistory, markApiOffline, markApiOnline]
  );

  useEffect(() => {
    if (!apiOnline) return;
    const interval = setInterval(() => {
      const pendingJobs = jobsRef.current.filter((job) =>
        isJobInFlight(job.state)
      );
      pendingJobs.forEach((job) => updateJobFromServer(job));
    }, 4000);

    return () => clearInterval(interval);
  }, [apiOnline, updateJobFromServer]);

  const refreshJobs = useCallback(
    (force = false) => {
      if (!force && !apiOnline) return;
      const snapshot = [...jobsRef.current];
      if (!snapshot.length) return;
      snapshot.forEach((job) => updateJobFromServer(job, { force }));
    },
    [apiOnline, updateJobFromServer]
  );

  const cancelJob = async (jobId) => {
    try {
      const res = await fetch(`/api/job/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Không thể hủy job");
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId ? { ...job, state: "cancelled" } : job
        )
      );
      setStatus(`Đã hủy job ${jobId}`);
      markApiOnline();
    } catch (err) {
      if (isNetworkError(err)) {
        markApiOffline("Không thể kết nối API khi hủy job.");
        setStatus("API không phản hồi, không thể hủy job.");
      } else {
        console.error(err);
        setStatus(`Không thể hủy job ${jobId}`);
      }
    }
  };

  const retryJob = async (jobId) => {
    try {
      const res = await fetch(`/api/job/${jobId}/retry`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Không thể retry job");
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? { ...job, state: "waiting", progress: 0, result: null }
            : job
        )
      );
      setStatus(`Đã retry job ${jobId}`);
      markApiOnline();
    } catch (err) {
      if (isNetworkError(err)) {
        markApiOffline("Không thể kết nối API khi retry job.");
        setStatus("API không phản hồi, retry thất bại.");
      } else {
        console.error(err);
        setStatus(`Retry job ${jobId} thất bại`);
      }
    }
  };

  const attemptReconnect = useCallback(() => {
    markApiOnline();
    fetchHistory({ force: true });
    fetchCacheStats({ force: true });
    refreshJobs(true);
  }, [fetchHistory, fetchCacheStats, refreshJobs, markApiOnline]);

  const downloadJobResult = (job) => {
    if (!job?.result?.outputBase64) return;
    const link = document.createElement("a");
    link.href = `data:${job.result.mime};base64,${job.result.outputBase64}`;
    link.download = job.result.filename || job.originalName || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const jobStateLabel = (state) => {
    switch (state) {
      case "completed":
        return "Hoàn tất";
      case "failed":
        return "Thất bại";
      case "cancelled":
        return "Đã hủy";
      case "not_found":
        return "Không tìm thấy";
      default:
        return state || "waiting";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      alert("Vui lòng chọn ít nhất một tệp!");
      return;
    }

    setStatus(
      processingMode === "sync"
        ? `Đang xử lý ${selectedFiles.length} tệp...`
        : `Đang tạo ${selectedFiles.length} job async...`
    );
    setSuccessfulResults([]);
    setFailedResults([]);
    // Mark all selected files as processing
    const now = Date.now();
    setProcessingList(
      selectedFiles.map((f, idx) => ({
        originalName: f.name,
        tempId: `${now}-${idx}`,
      }))
    );

    const targetLang = targetLangRef.current.value;
    const outputFormat = outputFormatRef.current.value;

    if (processingMode === "async") {
      const newJobs = [];
      const failures = [];
      let networkFailed = false;

      for (const file of selectedFiles) {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("targetLang", targetLang);
        fd.append("outputFormat", outputFormat);
        const docTitle = file.name.replace(/\.[^.]+$/, "") || "Document";
        fd.append("docTitle", docTitle);
        try {
          const res = await fetch("/api/convert-async", {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Không thể tạo job");
          }
          newJobs.push({
            jobId: data.jobId,
            originalName: file.name,
            title: docTitle,
            state: "waiting",
            progress: 0,
            targetLang,
            outputFormat,
            createdAt: Date.now(),
          });
          // add to processing list by jobId so we can move it later
          setProcessingList((prev) => [
            { originalName: file.name, jobId: data.jobId },
            ...prev,
          ]);
          markApiOnline();
        } catch (err) {
          if (isNetworkError(err)) {
            markApiOffline("Không thể kết nối API khi tạo job async.");
            failures.push({ name: file.name, reason: "API không phản hồi." });
            networkFailed = true;
            break;
          }
          console.error(err);
          failures.push({ name: file.name, reason: err.message });
        }
      }

      if (newJobs.length) {
        setJobs((prev) => [...newJobs, ...prev]);
        setStatus(
          `Đã thêm ${newJobs.length} job async. Dashboard sẽ tự cập nhật.`
        );
      }
      if (failures.length) {
        setStatus(
          (prev) =>
            `${prev} • Không thể tạo ${failures.length} job: ${failures
              .map((f) => f.name)
              .join(", ")}`
        );
      }
      if (networkFailed) {
        setStatus("Backend không phản hồi. Hãy bật server rồi thử lại.");
      }
      setSelectedFiles([]);
      return;
    }

    const fd = new FormData();
    selectedFiles.forEach((f) => fd.append("images", f));
    fd.append("targetLang", targetLang);
    fd.append("outputFormat", outputFormat);

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
      markApiOnline();

      setSuccessfulResults(
        data.success.map((f) => ({
          originalName: f.originalName,
          downloadName: f.filename,
          downloadUrl: `data:${f.mime};base64,${f.outputBase64}`,
        }))
      );
      setFailedResults(data.failed || []);
      // clear processing list entries that match returned originals
      setProcessingList((prev) =>
        prev.filter(
          (p) =>
            !data.success.some((s) => s.originalName === p.originalName) &&
            !(data.failed || []).some((f) => f.originalName === p.originalName)
        )
      );

      setStatus(
        `Hoàn tất ${data.success.length}/${
          selectedFiles.length
        } tệp. Thất bại: ${(data.failed || []).length}.`
      );
      fetchHistory();
    } catch (err) {
      if (isNetworkError(err)) {
        markApiOffline("Không thể kết nối API khi chạy chế độ sync.");
        setStatus("Backend không phản hồi. Hãy bật server rồi thử lại.");
      } else {
        console.error(err);
        setStatus("Lỗi khi gửi yêu cầu.");
      }
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Trình chuyển đổi OCR & Dịch thuật</h1>
        <p>Chuyển đổi và dịch nhiều tệp một cách hiệu quả</p>
      </header>

      <form onSubmit={handleSubmit}>
        <FileDropzone
          selectedFiles={selectedFiles}
          onFileChange={handleFileChange}
          onFileRemove={handleFileRemove}
          fileInputRef={fileInputRef}
        />

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

        <ModeToggle
          processingMode={processingMode}
          setProcessingMode={setProcessingMode}
        />

        <p className="mode-hint">
          {processingMode === "sync"
            ? "Sync path = phản hồi nhanh nhưng blocking."
            : "Async path = đẩy job vào MQ, UI poll /api/job/:id và có thể hủy job."}
        </p>

        <button type="submit" className="submit-btn">
          {processingMode === "sync"
            ? `Chạy sync (${selectedFiles.length || 0} tệp)`
            : `Đẩy job async (${selectedFiles.length || 0} tệp)`}
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

      {!apiOnline && (
        <div className="status-message warning">
          <div>
            {apiError ||
              "Không thể kết nối API backend (http://localhost:3000)."}
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={attemptReconnect}
          >
            Thử kết nối lại
          </button>
        </div>
      )}

      {(successfulResults.length > 0 ||
        failedResults.length > 0 ||
        cacheStats ||
        processingList.length > 0) && (
        <div className="results-tabs">
          <nav className="tabs-nav">
            <button
              className={`tab-btn ${
                activeTab === "processing" ? "active" : ""
              }`}
              onClick={() => setActiveTab("processing")}
            >
              Đang xử lý ({processingList.length})
            </button>
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
            <button
              className={`tab-btn ${activeTab === "stats" ? "active" : ""}`}
              onClick={() => setActiveTab("stats")}
            >
              Statistics
            </button>
          </nav>
          <div className="tab-content">
            {activeTab === "processing" && (
              <ul className="result-list">
                {processingList.map((p, index) => (
                  <li
                    key={p.jobId || p.tempId || index}
                    className="result-item processing-item"
                  >
                    <span className="file-name">{p.originalName}</span>
                    <span className="processing-tag">Đang xử lý...</span>
                  </li>
                ))}
              </ul>
            )}
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
            {activeTab === "stats" && (
              <CacheStatsPanel
                stats={cacheStats}
                onRefresh={() => fetchCacheStats({ force: true })}
              />
            )}
          </div>
        </div>
      )}

      <section className="job-dashboard">
        <div className="section-header">
          <div>
            <h3>Async Job Dashboard</h3>
            <p>Theo dõi tiến trình các job được tạo qua /api/convert-async</p>
          </div>
          <div className="section-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => refreshJobs(true)}
              disabled={!jobs.length}
            >
              Làm mới
            </button>
          </div>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-panel">
            Chưa có job async. Chọn chế độ Async rồi gửi file để xem dashboard.
          </div>
        ) : (
          <ul className="job-list">
            {jobs.map((job) => {
              const progress = Math.min(100, Math.max(0, job.progress || 0));
              const stateLabel = jobStateLabel(job.state);
              const canCancel = isJobInFlight(job.state);
              const canRetry = job.state === "failed";
              const readyToDownload =
                job.state === "completed" && job.result?.outputBase64;
              return (
                <li key={job.jobId} className={`job-item state-${job.state}`}>
                  <div className="job-info">
                    <div className="job-name">{job.originalName}</div>
                    <div className="job-meta">
                      #{job.jobId} • {stateLabel} • {progress}%
                    </div>
                    <div className="job-meta">
                      {job.targetLang?.toUpperCase()} • {job.outputFormat}
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="job-actions">
                    {readyToDownload ? (
                      <button
                        type="button"
                        className="download-btn"
                        onClick={() => downloadJobResult(job)}
                      >
                        Tải kết quả
                      </button>
                    ) : canRetry ? (
                      <>
                        <button
                          type="button"
                          className="retry-btn"
                          onClick={() => retryJob(job.jobId)}
                          disabled={!apiOnline}
                        >
                          Retry job
                        </button>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => cancelJob(job.jobId)}
                          disabled={!apiOnline}
                        >
                          Xoá job
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => cancelJob(job.jobId)}
                        disabled={!apiOnline || !canCancel}
                      >
                        Huỷ job
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Floating OCR history widget */}
      <div className={`ocr-history-widget ${historyOpen ? "open" : ""}`}>
        <div className="ocr-history-header">
          <strong>Lịch sử OCR</strong>
          <div className="ocr-history-controls">
            <button
              title="Xóa lịch sử"
              className="clear-btn"
              onClick={async () => {
                if (
                  !confirm(
                    "Bạn có chắc chắn muốn xóa toàn bộ lịch sử OCR không?"
                  )
                )
                  return;
                try {
                  const res = await fetch("/api/ocr-history/clear", {
                    method: "POST",
                  });
                  if (!res.ok) throw new Error("Clear history failed");
                  setOcrHistory([]); // Xóa ngay lập tức ở UI
                  markApiOnline();
                } catch (e) {
                  if (isNetworkError(e)) {
                    markApiOffline("Không thể kết nối API khi xóa lịch sử.");
                    alert("API không phản hồi, không thể xóa lịch sử.");
                  } else {
                    console.error(e);
                    alert("Không thể xóa lịch sử.");
                  }
                }
              }}
            >
              🗑️
            </button>
            <button
              title="Làm mới"
              onClick={() => fetchHistory({ force: true })}
            >
              ⟳
            </button>
            <button onClick={() => setHistoryOpen((v) => !v)}>
              {historyOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
        <div className="ocr-history-list">
          {ocrHistory.length === 0 && (
            <div className="empty">Chưa có lịch sử</div>
          )}
          {ocrHistory.map((item) => (
            <div key={item.id} className="ocr-history-item">
              <div className="left">
                <div className="name">{item.originalName}</div>
                <div className="meta">
                  {new Date(item.ts).toLocaleString()} •{" "}
                  {item.targetLang || item.targetLang}
                </div>
              </div>
              <div className="actions">
                <a
                  href={`/api/ocr-history/${item.id}/download`}
                  className="small-btn"
                >
                  Tải
                </a>
                <button
                  className="small-btn"
                  onClick={() => {
                    window.open(
                      `/api/ocr-history/${item.id}/download`,
                      "_blank"
                    );
                  }}
                >
                  Xem
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
