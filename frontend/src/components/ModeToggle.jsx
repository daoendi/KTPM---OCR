import React from "react";

export default function ModeToggle({ processingMode, setProcessingMode }) {
  return (
    <div className="mode-toggle">
      <label
        className={`mode-option ${processingMode === "sync" ? "active" : ""}`}
      >
        <input
          type="radio"
          name="processing-mode"
          value="sync"
          checked={processingMode === "sync"}
          onChange={(e) => setProcessingMode(e.target.value)}
        />
        <div>
          <strong>Sync mode</strong>
          <span>Blocking, trả file ngay (dùng cho demo và file nhỏ).</span>
        </div>
      </label>
      <label
        className={`mode-option ${processingMode === "async" ? "active" : ""}`}
      >
        <input
          type="radio"
          name="processing-mode"
          value="async"
          checked={processingMode === "async"}
          onChange={(e) => setProcessingMode(e.target.value)}
        />
        <div>
          <strong>Async mode</strong>
          <span>
            Hàng đợi MQ, chịu tải lớn, kết hợp với dashboard để theo dõi.
          </span>
        </div>
      </label>
    </div>
  );
}
