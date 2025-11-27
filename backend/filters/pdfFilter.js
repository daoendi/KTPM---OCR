import crypto from "crypto";
import { textToPdfBuffer } from "../utils/pdf.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const EXPORT_CACHE_TTL = parseInt(process.env.CACHE_EXPORT_TTL || "604800", 10);

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
  const textHash =
    ctx.translatedHash ||
    ctx.textHash ||
    crypto.createHash("sha256").update(String(content)).digest("hex");

  const exportKey = `ocr:export:${textHash}:pdf`;
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    recordHit("export");
    let payload;
    try {
      payload = JSON.parse(cachedOutput);
    } catch (err) {
      payload = {
        fileBase64: cachedOutput,
        mime: "application/pdf",
        filename: `${title}.pdf`,
      };
    }
    ctx.output = Buffer.from(payload.fileBase64, "base64");
    ctx.mime = payload.mime;
    ctx.filename = payload.filename;
    ctx.exportFromCache = true;
    console.log("   -> PDF Export Cache hit.");
  } else {
    recordMiss("export");
    const normalizedContent = String(content)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n\n")
      .trim();

    ctx.output = await textToPdfBuffer(normalizedContent, title);
    ctx.mime = "application/pdf";
    ctx.filename = `${title}.pdf`;
    ctx.exportFromCache = false;
    try {
      await redisClient.set(
        exportKey,
        JSON.stringify({
          fileBase64: ctx.output.toString("base64"),
          mime: ctx.mime,
          filename: ctx.filename,
        }),
        "EX",
        EXPORT_CACHE_TTL
      );
    } catch (err) {
      console.error("Failed to cache PDF export", err);
    }
    console.log("   -> PDF Export Cache miss, generating PDF.");
  }

  return ctx;
}
