// utils/cacheStats.js

// Biến toàn cục lưu số lần cache HIT và MISS
let stats = {
  hits: 0,
  misses: 0,
};

/**
 * Ghi nhận một lần Cache HIT
 */
export function recordHit() {
  stats.hits++;
}

/**
 * Ghi nhận một lần Cache MISS
 */
export function recordMiss() {
  stats.misses++;
}

/**
 * Lấy thống kê cache hiện tại
 * @returns {Object} hits, misses, total, hitRate
 */
export function getCacheStats() {
  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    total,
    hitRate: total > 0 ? ((stats.hits / total) * 100).toFixed(2) + "%" : "0%",
  };
}

/**
 * Reset toàn bộ thống kê cache về 0
 */
export function resetStats() {
  stats = { hits: 0, misses: 0 };
}
