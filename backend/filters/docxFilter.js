import crypto from "crypto";
import { Document, Packer, Paragraph } from "docx";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

/**
 * Filter này chuyển đổi văn bản thành DOCX và tích hợp logic cache.
 *
 * @param {object} ctx - Đối tượng context của pipeline.
 * @returns {Promise<object>} - Context đã được cập nhật với file DOCX.
 */
export async function DocxFilter(ctx) {
  const content = ctx.translated ?? ctx.text ?? "";
  const title = ctx.title || "Document";

  // 1. Tạo cache key
  const exportKey = crypto
    .createHash("sha256")
    .update(String(content))
    .update(title)
    .update("docx")
    .digest("hex");

  // 2. Kiểm tra cache
  const cachedOutput = await redisClient.get(exportKey);

  if (cachedOutput) {
    // 3a. Cache hit
    recordHit("export");
    ctx.output = Buffer.from(cachedOutput, "base64");
    ctx.exportFromCache = true;
    console.log("   -> DOCX Export Cache hit.");
  } else {
    // 3b. Cache miss
    recordMiss("export");
    const lines = String(content).split(/\r?\n/);
    const doc = new Document({
      sections: [{ children: lines.map((line) => new Paragraph(line)) }],
    });
    ctx.output = await Packer.toBuffer(doc);
    await redisClient.set(exportKey, ctx.output.toString("base64"));
    ctx.exportFromCache = false;
    console.log("   -> DOCX Export Cache miss, generating DOCX.");
  }

  ctx.mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  ctx.filename = `${title}.docx`;

  return ctx;
}
