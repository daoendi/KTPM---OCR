import { textToPdfBuffer } from "../utils/pdf.js";
import { redisClient } from "../utils/redisClient.js";

export async function PdfFilter(ctx) {
  const start = performance.now(); // ⏱️ Bắt đầu đo thời gian

  let content = ctx.translatedText || ctx.translated || ctx.text || "";
  if (Array.isArray(content)) content = content.join("\n");

  content = String(content)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  ctx.output = await textToPdfBuffer(content, ctx.title || "Document");
  ctx.mime = "application/pdf";
  ctx.filename = `${ctx.title || "Document"}.pdf`;

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
      { EX: 60 * 60 }
    );
    console.log("✅ Saved PDF result to cache:", ctx.cacheKey);
  }

  const end = performance.now(); //  Kết thúc đo
  // console.log(` PDF generation time: ${(end - start).toFixed(2)} ms`);

  return ctx;
}
