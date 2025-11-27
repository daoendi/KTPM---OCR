import React from "react";

export default function CacheStatsPanel({ stats, onRefresh }) {
  if (!stats) {
    return (
      <div className="cache-stats-panel">
        <p>Chưa có dữ liệu cache.</p>
        <button
          type="button"
          className="ghost-btn"
          onClick={onRefresh}
          disabled={!onRefresh}
        >
          Tải lại
        </button>
      </div>
    );
  }

  const total = stats.total || 0;
  const hitRate = total ? (stats.hits / total) * 100 : 0;
  const missRate = Math.max(0, 100 - hitRate);

  return (
    <div className="cache-stats-panel">
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Hits</span>
          <strong>{stats.hits}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Misses</span>
          <strong>{stats.misses}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Hit rate</span>
          <strong>{stats.hitRate}</strong>
        </div>
      </div>
      <div className="cache-bar">
        <span className="hit" style={{ width: `${hitRate}%` }} />
        <span className="miss" style={{ width: `${missRate}%` }} />
      </div>
      <div className="stat-footer">
        <span>Tổng yêu cầu: {total}</span>
        <button
          type="button"
          className="ghost-btn"
          onClick={onRefresh}
          disabled={!onRefresh}
        >
          Làm mới
        </button>
      </div>
    </div>
  );
}
