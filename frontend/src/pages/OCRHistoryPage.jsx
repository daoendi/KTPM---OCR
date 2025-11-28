import React, { useEffect, useState, useCallback } from "react";

export default function OCRHistoryPage() {
  const [ocrHistory, setOcrHistory] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const isNetworkError = (error) => {
    if (!error) return false;
    if (error.name === "TypeError") return true;
    const msg = String(error.message || "");
    return /Failed to fetch|ECONNREFUSED|ECONNRESET|NetworkError/.test(msg);
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ocr-history?limit=200", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      setOcrHistory(data || []);
    } catch (e) {
      if (isNetworkError(e)) {
        // ignore for now
      } else {
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const iv = setInterval(fetchHistory, 5000);
    return () => clearInterval(iv);
  }, [fetchHistory]);

  const openPreview = async (id) => {
    try {
      const res = await fetch(`/api/ocr-history/${id}/download`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Not found");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
    } catch (e) {
      if (isNetworkError(e)) alert("API không phản hồi.");
      else alert("Không thể mở file lịch sử.");
    }
  };

  const clearHistory = async () => {
    if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử OCR không?"))
      return;
    try {
      const res = await fetch("/api/ocr-history/clear", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Clear failed");
      setOcrHistory([]);
      alert("Đã xóa lịch sử");
    } catch (e) {
      alert("Không thể xóa lịch sử.");
    }
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>Lịch sử OCR</h2>
        <div className="history-controls">
          <input
            className="ocr-history-search"
            placeholder="Tìm theo tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="ghost-btn" onClick={() => fetchHistory()}>
            ⟳ Làm mới
          </button>
          <button className="clear-btn" onClick={clearHistory}>
            🗑️ Xóa
          </button>
        </div>
      </div>
      <div className="ocr-history-list history-list-full">
        {loading && <div className="empty">Đang tải...</div>}
        {!loading && ocrHistory.length === 0 && (
          <div className="empty">Chưa có lịch sử</div>
        )}
        {ocrHistory
          .filter((item) =>
            item.originalName
              .toLowerCase()
              .includes(search.trim().toLowerCase())
          )
          .map((item) => (
            <div key={item.id} className="ocr-history-item">
              <div className="left">
                <div className="name">{item.originalName}</div>
                <div className="meta">
                  {new Date(item.ts).toLocaleString()} • {item.targetLang}
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
                  onClick={() => openPreview(item.id)}
                >
                  Xem
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
