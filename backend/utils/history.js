import crypto from "crypto";
import { redisClient } from "./redisClient.js";

const LIST_KEY = "ocr:history:list";
const ITEM_PREFIX = "ocr:history:item:";
const MAX_HISTORY = 200;

/**
 * Ghi một mục lịch sử OCR vào Redis
 * @param {{ originalName: string, filename: string, mime: string, outputBase64?: string, targetLang?: string, outputFormat?: string }} meta
 * @returns {string} id
 */
export async function recordHistory(meta = {}) {
  const id = crypto.randomBytes(8).toString("hex");
  const ts = Date.now();
  const item = { id, ts, ...meta };

  try {
    await redisClient.set(ITEM_PREFIX + id, JSON.stringify(item));
    await redisClient.lPush(LIST_KEY, id);
    await redisClient.lTrim(LIST_KEY, 0, MAX_HISTORY - 1);
  } catch (err) {
    console.error("Failed to record history:", err);
  }
  return id;
}

/**
 * Lấy danh sách lịch sử (mới nhất trước)
 * @param {number} limit
 * @param {boolean} omitOutput - Bỏ qua trường outputBase64 nặng
 */
export async function getHistory(limit = 50, omitOutput = false) {
  try {
    const ids = await redisClient.lRange(LIST_KEY, 0, limit - 1);
    if (!ids || ids.length === 0) return [];
    const keys = ids.map((i) => ITEM_PREFIX + i);
    const vals = await redisClient.mGet(keys);
    const parsed = vals.map((v) => {
      try {
        const item = JSON.parse(v);
        if (omitOutput) {
          // Giữ lại outputBase64 nếu cần cho chức năng xem trực tiếp
          const { outputBase64, ...rest } = item;
          return rest;
        }
        return item;
      } catch (e) {
        return null;
      }
    });
    return parsed.filter(Boolean);
  } catch (err) {
    console.error("Failed to get history:", err);
    return [];
  }
}

export async function getHistoryItem(id) {
  try {
    const v = await redisClient.get(ITEM_PREFIX + id);
    if (!v) return null;
    return JSON.parse(v);
  } catch (err) {
    console.error("Failed to get history item:", err);
    return null;
  }
}

export async function clearHistory() {
  try {
    const ids = await redisClient.lRange(LIST_KEY, 0, -1);
    if (ids && ids.length > 0) {
      const keys = ids.map((i) => ITEM_PREFIX + i);
      await redisClient.del(keys);
    }
    await redisClient.del(LIST_KEY);
    return true;
  } catch (err) {
    console.error("Failed to clear history:", err);
    return false;
  }
}
