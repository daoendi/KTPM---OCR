import crypto from "crypto";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const EXPORT_CACHE_TTL = parseInt(process.env.CACHE_EXPORT_TTL || "604800", 10);

/**
 * Filter này chuyển đổi văn bản thành .txt và tích hợp logic cache.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với file .txt.
 */
export async function TxtFilter(ctx) {
  const content = ctx.translated ?? ctx.text ?? "";
  const title = ctx.title || "Document";
  const textHash =
    ctx.translatedHash ||
    ctx.textHash ||
    crypto.createHash("sha256").update(String(content)).digest("hex");

  const exportKey = `ocr:export:${textHash}:txt`;
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    recordHit("export");
    let payload;
    try {
      payload = JSON.parse(cachedOutput);
    } catch (err) {
      payload = {
        fileBase64: cachedOutput,
        mime: "text/plain",
        filename: `${title}.txt`,
      };
    }
    ctx.output = Buffer.from(payload.fileBase64, "base64");
    ctx.mime = payload.mime;
    ctx.filename = payload.filename;
    ctx.exportFromCache = true;
    console.log("   -> TXT Export Cache hit.");
  } else {
    recordMiss("export");
    const normalizedContent = String(content)
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    ctx.output = Buffer.from(normalizedContent, "utf-8");
    ctx.mime = "text/plain";
    ctx.filename = `${title}.txt`;
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
      console.error("Failed to cache TXT export", err);
    }
    console.log("   -> TXT Export Cache miss, generating TXT.");
  }

  return ctx;
}
