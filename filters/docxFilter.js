import { Document, Packer, Paragraph } from "docx";
import { redisClient } from "../utils/redisClient.js";

/**
 * Filter để chuyển đổi văn bản trong context thành file DOCX.
 *
 * @param {object} ctx - Đối tượng context.
 * @property {string} [ctx.translated] - Văn bản đã dịch (ưu tiên sử dụng).
 * @property {string} [ctx.text] - Văn bản gốc.
 * @property {string} [ctx.title] - Tiêu đề của tài liệu.
 * @returns {Promise<object>} - Context được cập nhật với buffer DOCX, mime type và tên file.
 */
export async function DocxFilter(ctx) {
  // Lấy nội dung văn bản, đảm bảo nó là một chuỗi trước khi chia.
  let rawContent = ctx.translated ?? ctx.text ?? "";
  if (Array.isArray(rawContent)) {
    rawContent = rawContent.join("\n");
  }
  const content = String(rawContent).split(/\r?\n/);

  // Tạo một tài liệu DOCX mới.
  const doc = new Document({
    sections: [
      {
        children: content.map((line) => new Paragraph(line)),
      },
    ],
  });

  // Chuyển đổi tài liệu thành buffer.
  const buffer = await Packer.toBuffer(doc);

  // Cập nhật context với dữ liệu output.
  ctx.output = buffer;
  ctx.mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  ctx.filename = `${ctx.title || "Document"}.docx`;

  // Lưu kết quả vào cache nếu có cacheKey và Redis client đã sẵn sàng.
  if (ctx.cacheKey && redisClient?.isOpen) {
    try {
      await redisClient.set(
        ctx.cacheKey,
        JSON.stringify({
          text: ctx.text,
          translated: ctx.translated,
          mime: ctx.mime,
          filename: ctx.filename,
          output: ctx.output.toString("base64"),
        }),
        { EX: 60 * 60 } // Thời gian hết hạn cache là 1 giờ.
      );
      console.log("Saved DOCX to cache:", ctx.cacheKey);
    } catch (e) {
      console.error("Error saving DOCX to cache:", e.message);
    }
  } else {
    console.warn("Redis not ready, skipping DOCX cache.");
  }

  return ctx;
}
