import crypto from "crypto";
import { Document, Packer, Paragraph } from "docx";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const EXPORT_CACHE_TTL = parseInt(process.env.CACHE_EXPORT_TTL || "604800", 10);

/**
 * Filter này chuyển đổi văn bản thành DOCX và tích hợp logic cache.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với file DOCX.
 */
export async function DocxFilter(ctx) {
  const content = ctx.translated ?? ctx.text ?? "";
  const title = ctx.title || "Document";
  const textHash =
    ctx.translatedHash ||
    ctx.textHash ||
    crypto.createHash("sha256").update(String(content)).digest("hex");

  const exportKey = `ocr:export:${textHash}:docx`;
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    recordHit("export");
    let payload;
    try {
      payload = JSON.parse(cachedOutput);
    } catch (err) {
      payload = {
        fileBase64: cachedOutput,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: `${title}.docx`,
      };
    }
    ctx.output = Buffer.from(payload.fileBase64, "base64");
    ctx.mime = payload.mime;
    ctx.filename = payload.filename;
    ctx.exportFromCache = true;
    console.log("   -> DOCX Export Cache hit.");
  } else {
    recordMiss("export");
    const lines = String(content).split(/\r?\n/);
    const doc = new Document({
      sections: [{ children: lines.map((line) => new Paragraph(line)) }],
    });
    ctx.output = await Packer.toBuffer(doc);
    ctx.mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    ctx.filename = `${title}.docx`;
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
      console.error("Failed to cache DOCX export", err);
    }
    console.log("   -> DOCX Export Cache miss, generating DOCX.");
  }

  return ctx;
}
