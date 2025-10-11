import { textToPdfBuffer } from "../utils/pdf.js";
import { redisClient } from "../utils/redisClient.js";

export async function PdfFilter(ctx) {
  // ✅ Ưu tiên bản dịch nếu có, fallback về văn bản OCR
  let content = ctx.translatedText || ctx.translated || ctx.text || "";

  // ✅ Nếu là mảng, nối bằng xuống dòng
  if (Array.isArray(content)) {
    content = content.join("\n");
  }

  // ✅ Làm sạch nội dung: thay thế \r\n hoặc ký tự lạ
  content = String(content)
    .replace(/\r\n/g, "\n") // Chuẩn hóa xuống dòng
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n\n") // Gộp nhiều dòng trống
    .trim();

  // ✅ Chuyển text thành PDF (utils/pdf.js cần hỗ trợ font Unicode)
  ctx.output = await textToPdfBuffer(content, ctx.title || "Document");
  ctx.mime = "application/pdf";
  ctx.filename = `${ctx.title || "Document"}.pdf`;

  // ✅ Cache kết quả nếu Redis sẵn sàng
  if (ctx.cacheKey && redisClient?.isOpen) {
    await redisClient.set(
      ctx.cacheKey,
      JSON.stringify({
        text: ctx.text,
        translatedText: ctx.translatedText || ctx.translated,
        mime: ctx.mime,
        filename: ctx.filename,
        output: ctx.output.toString("base64"),
      }),
      { EX: 60 * 60 } // cache 1 giờ
    );
    console.log("✅ Saved PDF result to cache:", ctx.cacheKey);
  } else {
    console.log("⚠️ Redis client not available, skipping cache.");
  }

  return ctx;
}
