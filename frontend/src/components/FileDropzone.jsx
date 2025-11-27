import React, { useState, useCallback } from "react";

export default function FileDropzone({
  selectedFiles,
  onFileChange,
  onFileRemove,
  fileInputRef,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragOver(false), []);
  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      onFileChange(e.dataTransfer.files);
    },
    [onFileChange]
  );

  return (
    <>
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
          onChange={(e) => onFileChange(e.target.files)}
          multiple
          hidden
          accept="image/*,.pdf"
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="file-list">
          <h4>
            Tệp đã chọn: <small>({selectedFiles.length})</small>
          </h4>
          <div className="file-list-scroll">
            {selectedFiles.map((file, index) => (
              <div key={index} className="file-item compact">
                <span className="file-name">{file.name}</span>
                <button type="button" onClick={() => onFileRemove(file.name)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
