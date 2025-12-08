import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import { useNavigate, Routes, Route, NavLink } from "react-router-dom";
import "./App.css";
import FileDropzone from "./components/FileDropzone";
import CacheStatsPanel from "./components/CacheStatsPanel";
import OCRHistoryPage from "./pages/OCRHistoryPage";
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
  const [navOpen, setNavOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  // load saved theme from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ocr_theme_v1");
      if (raw) {
        const { primary, accent } = JSON.parse(raw);
        if (primary) {
          document.documentElement.style.setProperty(
            "--color-primary",
            primary
          );
        }
        if (accent) {
          document.documentElement.style.setProperty("--accent", accent);
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const applyTheme = (primary, accent) => {
    if (primary)
      document.documentElement.style.setProperty("--color-primary", primary);
    if (accent) document.documentElement.style.setProperty("--accent", accent);
    try {
      localStorage.setItem("ocr_theme_v1", JSON.stringify({ primary, accent }));
    } catch (e) {}
  };

  // close panels on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setNavOpen(false);
        setThemeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [successfulResults, setSuccessfulResults] = useState([]);
  const [failedResults, setFailedResults] = useState([]);
  const [processingList, setProcessingList] = useState([]);
  const [status, setStatus] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState("success");
  // always use async mode
  const [jobs, setJobs] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [apiOnline, setApiOnline] = useState(true);
  const [apiError, setApiError] = useState("");
  const fileInputRef = useRef(null);
  const targetLangRef = useRef(null);
  const outputFormatRef = useRef(null);
  const jobsRef = useRef([]);
  // history moved to separate page
  const { user, logout, isReady } = useAuth();
  const navigate = useNavigate();
  const { pathname } = window.location;

  // Redirect to login after initial auth check completes
  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      if (!pathname.startsWith("/login") && !pathname.startsWith("/register")) {
        navigate("/login");
      }
    }
  }, [isReady, user, navigate, pathname]);
  // Lists are scrollable; no expand/collapse needed

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
        const res = await fetch("/api/ocr-history?limit=20", {
          credentials: "include",
        });
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
        const res = await fetch("/api/cache-stats", { credentials: "include" });
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
        const res = await fetch(`/api/job/${job.jobId}`, {
          credentials: "include",
        });
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
            const originalName = matching ?.originalName || `Job ${job.jobId}`;
            // add to successfulResults if not already present
            setSuccessfulResults((prev) => {
              const exists = prev.some(
                (p) =>
                  p.originalName === originalName &&
                  p.downloadName === (data.result ?.filename || "")
              );
              if (exists) return prev;
              const newItem = {
                originalName,
                downloadName: data.result ?.filename,
                downloadUrl: data.result ?.outputBase64
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
            const originalName = matching ?.originalName || `Job ${job.jobId}`;
            setFailedResults((prev) => {
              const exists = prev.some((f) => f.originalName === originalName);
              if (exists) return prev;
              return [
                { originalName, error: data ?.error || "Failed" },
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

  // Derived async job lists for unified UI
  const asyncProcessingJobs = jobs.filter((j) => isJobInFlight(j.state));
  const asyncCompletedJobs = jobs.filter(
    (j) => j.state === "completed" && j.result ?.outputBase64
  );
  const asyncFailedJobs = jobs.filter((j) => j.state === "failed");
  // combined processing count: processingList (temps + jobId entries) + any in-flight jobs not yet in processingList
  const processingCount =
    processingList.length +
    asyncProcessingJobs.filter(
      (j) => !processingList.some((p) => p.jobId === j.jobId)
    ).length;

  // Build combined lists for tabs (so we can slice for previews)
  const combinedProcessingItems = (() => {
    const tempItems = processingList.map((p, idx) => ({
      key: p.jobId ? `job-${p.jobId}` : `temp-${p.tempId || idx}`,
      originalName: p.originalName,
      jobId: p.jobId,
      temp: !p.jobId,
    }));
    const extraAsync = asyncProcessingJobs
      .filter((j) => !processingList.some((p) => p.jobId === j.jobId))
      .map((j) => ({
        key: `job-${j.jobId}`,
        originalName: j.originalName,
        jobId: j.jobId,
        temp: false,
      }));
    return [...tempItems, ...extraAsync];
  })();

  const combinedSuccessItems = (() => {
    const sync = successfulResults.map((r, i) => ({
      key: `sr-${i}`,
      originalName: r.originalName,
      downloadUrl: r.downloadUrl,
      downloadName: r.downloadName,
      isAsync: false,
    }));
    const asyncs = asyncCompletedJobs.map((j) => ({
      key: `aj-${j.jobId}`,
      originalName: j.originalName,
      job: j,
      isAsync: true,
    }));
    // Deduplicate: if a sync result already exists for the same originalName+filename,
    // don't include the async job result to avoid showing the same item twice.
    const syncKeys = new Set(
      sync.map((s) => `${s.originalName}::${s.downloadName || ""}`)
    );
    const filteredAsyncs = asyncs.filter((a) => {
      const filename = a.job ?.result ?.filename || "";
      const key = `${a.originalName}::${filename}`;
      return !syncKeys.has(key);
    });
    return [...sync, ...filteredAsyncs];
  })();

  const combinedFailedItems = (() => {
    const sync = (failedResults || []).map((r, i) => ({
      key: `fr-${i}`,
      originalName: r.originalName,
      error: r.error,
      isAsync: false,
    }));
    const asyncs = asyncFailedJobs.map((j) => ({
      key: `fj-${j.jobId}`,
      originalName: j.originalName,
      job: j,
      isAsync: true,
    }));
    return [...sync, ...asyncs];
  })();

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
      const res = await fetch(`/api/job/${jobId}`, {
        method: "DELETE",
        credentials: "include",
      });
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
      const res = await fetch(`/api/job/${jobId}/retry`, {
        method: "POST",
        credentials: "include",
      });
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
    if (!job ?.result ?.outputBase64) return;
    const link = document.createElement("a");
    link.href = `data:${job.result.mime};base64,${job.result.outputBase64}`;
    link.download = job.result.filename || job.originalName || "download";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openHistoryPreview = async (id) => {
    try {
      const res = await fetch(`/api/ocr-history/${id}/download`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Không thể mở file");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // revoke after a minute
      setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
      markApiOnline();
    } catch (e) {
      if (isNetworkError(e)) {
        markApiOffline("Không thể kết nối API khi mở file lịch sử.");
        alert("API không phản hồi, không thể mở file.");
      } else {
        console.error(e);
        alert("Không thể mở file lịch sử.");
      }
    }
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

    setStatus(`Đang tạo ${selectedFiles.length} job async...`);
    setSuccessfulResults([]);
    setFailedResults([]);
    // mark temp processing entries so user sees immediate items
    const now = Date.now();
    setProcessingList(
      selectedFiles.map((f, idx) => ({
        originalName: f.name,
        tempId: `${now}-${idx}`,
      }))
    );

    const targetLang = targetLangRef.current.value;
    const outputFormat = outputFormatRef.current.value;

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
        // remove any temp (no jobId) entries for the same originalName
        setProcessingList((prev) => [
          { originalName: file.name, jobId: data.jobId },
          ...prev.filter((p) => !(p.originalName === file.name && !p.jobId)),
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
      // Replace existing jobs list with the newly created jobs so the dashboard
      // reflects only the current submission (history is handled separately).
      setJobs(newJobs);
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
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <button
          className="nav-toggle"
          aria-label="Toggle navigation"
          onClick={() => setNavOpen((s) => !s)}
        >
          ☰
        </button>
        <h1>Trình chuyển đổi OCR & Dịch thuật</h1>
        <p>Chuyển đổi và dịch nhiều tệp một cách hiệu quả</p>
        <div style={{ position: "absolute", right: 28, top: 22 }}>
          <button
            className="theme-toggle btn-ghost"
            onClick={() => setThemeOpen((s) => !s)}
            style={{ marginRight: 8 }}
          >
            🎨
          </button>
          {themeOpen && (
            <div
              className="theme-panel card"
              role="dialog"
              aria-modal="false"
              aria-label="Theme settings"
              style={{ position: "absolute", right: 0, top: 40, zIndex: 4000 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong style={{ fontSize: 13 }}>Theme</strong>
                <button
                  className="ghost-btn"
                  onClick={() => setThemeOpen(false)}
                  aria-label="Close theme panel"
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <label style={{ fontSize: 12 }}>Primary</label>
                <input
                  type="color"
                  defaultValue={
                    getComputedStyle(document.documentElement)
                      .getPropertyValue("--color-primary")
                      .trim() || "#3b82f6"
                  }
                  onChange={(e) => applyTheme(e.target.value, null)}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 8,
                }}
              >
                <label style={{ fontSize: 12 }}>Accent</label>
                <input
                  type="color"
                  defaultValue={
                    getComputedStyle(document.documentElement)
                      .getPropertyValue("--accent")
                      .trim() || "#06b6d4"
                  }
                  onChange={(e) => applyTheme(null, e.target.value)}
                />
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    applyTheme("#3b82f6", "#06b6d4");
                  }}
                >
                  Default
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    applyTheme("#ef4444", "#f59e0b");
                  }}
                >
                  Warm
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    applyTheme("#10b981", "#06b6d4");
                  }}
                >
                  Green
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    applyTheme("#6366f1", "#06b6d4");
                  }}
                >
                  Violet
                </button>
              </div>
            </div>
          )}
          {user ? (
            <>
              <span style={{ marginRight: 8 }}>
                {user.displayName || user.username}
              </span>
              <button
                className="ghost-btn"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Logout
              </button>
            </>
          ) : null}
        </div>
      </header>

      {/* Async jobs are now merged into the unified tabs above. */}

      {/* Layout: left sidebar + main content area */}
      <div className="layout">
        <aside className={`side-nav ${navOpen ? "open" : ""}`}>
          <nav>
            <ul>
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={() => setNavOpen(false)}
                >
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/history"
                  className={({ isActive }) => (isActive ? "active" : "")}
                  onClick={() => setNavOpen(false)}
                >
                  Lịch sử OCR
                </NavLink>
              </li>
              <li>
                <button
                  className="ghost-btn"
                  onClick={() => {
                    logout();
                    navigate("/login");
                    setNavOpen(false);
                  }}
                >
                  Logout
                </button>
              </li>
            </ul>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <>
                  {/* converter + dashboard (Home) */}
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

                    <p className="mode-hint">
                      Async mode only — tất cả tệp sẽ tạo job async.
                    </p>

                    <button type="submit" className="submit-btn">
                      {`Đẩy job async (${selectedFiles.length || 0} tệp)`}
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

                  {/* existing dashboard content */}
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
                          Đang xử lý ({processingCount})
                        </button>
                        <button
                          className={`tab-btn ${
                            activeTab === "success" ? "active" : ""
                          }`}
                          onClick={() => setActiveTab("success")}
                        >
                          Thành công ({successfulResults.length})
                        </button>
                        <button
                          className={`tab-btn ${
                            activeTab === "failed" ? "active" : ""
                          }`}
                          onClick={() => setActiveTab("failed")}
                        >
                          Thất bại ({failedResults.length})
                        </button>
                        <button
                          className={`tab-btn ${
                            activeTab === "stats" ? "active" : ""
                          }`}
                          onClick={() => setActiveTab("stats")}
                        >
                          Statistics
                        </button>
                      </nav>
                      <div className="tab-content">
                        {activeTab === "processing" && (
                          <ul className="result-list scroll-list">
                            {combinedProcessingItems.map((p) => {
                              const job = p.jobId
                                ? jobs.find((j) => j.jobId === p.jobId)
                                : null;
                              const progress = job
                                ? Math.min(100, Math.max(0, job.progress || 0))
                                : 0;
                              return (
                                <li
                                  key={p.key}
                                  className="result-item processing-item"
                                >
                                  <div className="processing-left">
                                    <span className="file-name">
                                      {p.originalName}
                                    </span>
                                    <div className="processing-meta">
                                      {p.jobId ? `Job #${p.jobId}` : "Queued"}
                                    </div>
                                  </div>
                                  <div className="processing-right">
                                    <div className="progress-track small">
                                      <span style={{ width: `${progress}%` }} />
                                    </div>
                                    <div className="progress-percent">
                                      {progress}%
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {activeTab === "success" && (
                          <ul className="result-list scroll-list">
                            {combinedSuccessItems.map((it) => {
                              if (!it.isAsync) {
                                return (
                                  <li key={it.key} className="result-item">
                                    <span className="file-name">
                                      {it.originalName}
                                    </span>
                                    <a
                                      href={it.downloadUrl}
                                      download={it.downloadName}
                                      className="download-btn"
                                    >
                                      Tải về
                                    </a>
                                  </li>
                                );
                              }
                              return (
                                <li key={it.key} className="result-item">
                                  <span className="file-name">
                                    {it.originalName}
                                  </span>
                                  <button
                                    type="button"
                                    className="download-btn"
                                    onClick={() => downloadJobResult(it.job)}
                                  >
                                    Tải về
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {activeTab === "failed" && (
                          <ul className="result-list scroll-list">
                            {combinedFailedItems.map((it) => {
                              if (!it.isAsync) {
                                return (
                                  <li
                                    key={it.key}
                                    className="result-item error-item"
                                  >
                                    <span className="file-name">
                                      {it.originalName}
                                    </span>
                                    <span className="error-msg">
                                      {it.error}
                                    </span>
                                  </li>
                                );
                              }
                              return (
                                <li
                                  key={it.key}
                                  className="result-item error-item"
                                >
                                  <span className="file-name">
                                    {it.originalName}
                                  </span>
                                  <span className="error-msg">
                                    {it.job.result ?.error || "Thất bại"}
                                  </span>
                                  <div className="job-actions">
                                    <button
                                      type="button"
                                      className="retry-btn"
                                      onClick={() => retryJob(it.job.jobId)}
                                      disabled={!apiOnline}
                                    >
                                      Retry
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost-btn"
                                      onClick={() => cancelJob(it.job.jobId)}
                                      disabled={!apiOnline}
                                    >
                                      Xóa
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
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
                </>
              }
            />
            <Route path="/history" element={<OCRHistoryPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
export default App;
