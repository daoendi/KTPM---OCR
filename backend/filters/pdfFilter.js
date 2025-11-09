import crypto from "crypto";
import { textToPdfBuffer } from "../utils/pdf.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

/**
 * Filter này chuyển đổi văn bản thành PDF và tích hợp logic cache.
 * Cache key được tạo dựa trên nội dung, tiêu đề, và định dạng.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với file PDF.
 */
export async function PdfFilter(ctx) {
  const content = ctx.translated ?? ctx.text ?? "";
  const title = ctx.title || "Document";

  // 1. Tạo cache key
  const exportKey = crypto
    .createHash("sha256")
    .update(String(content))
    .update(title)
    .update("pdf") // Định dạng file
    .digest("hex");

  // 2. Kiểm tra cache
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    // 3a. Cache hit
    recordHit("export");
    ctx.output = Buffer.from(cachedOutput, "base64");
    ctx.exportFromCache = true;
    console.log("   -> PDF Export Cache hit.");
  } else {
    // 3b. Cache miss
    recordMiss("export");
    const normalizedContent = String(content)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n\n")
      .trim();

    ctx.output = await textToPdfBuffer(normalizedContent, title);
    // Lưu vào cache dưới dạng base64
    await redisClient.set(exportKey, ctx.output.toString("base64"));
    ctx.exportFromCache = false;
    console.log("   -> PDF Export Cache miss, generating PDF.");
  }

  ctx.mime = "application/pdf";
  ctx.filename = `${title}.pdf`;

  return ctx;
}
