import crypto from "crypto";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

/**
 * Filter này chuyển đổi văn bản thành .txt và tích hợp logic cache.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với file .txt.
 */
export async function TxtFilter(ctx) {
  const content = ctx.translated ?? ctx.text ?? "";
  const title = ctx.title || "Document";

  // 1. Tạo cache key
  const exportKey = crypto
    .createHash("sha256")
    .update(String(content))
    .update(title)
    .update("txt")
    .digest("hex");

  // 2. Kiểm tra cache
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    // 3a. Cache hit
    recordHit("export");
    ctx.output = Buffer.from(cachedOutput, "base64");
    ctx.exportFromCache = true;
    console.log("   -> TXT Export Cache hit.");
  } else {
    // 3b. Cache miss
    recordMiss("export");
    const normalizedContent = String(content)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    ctx.output = Buffer.from(normalizedContent, "utf-8");
    await redisClient.set(exportKey, ctx.output.toString("base64"));
    ctx.exportFromCache = false;
    console.log("   -> TXT Export Cache miss, generating TXT.");
  }

  ctx.mime = "text/plain";
  ctx.filename = `${title}.txt`;

  return ctx;
}
