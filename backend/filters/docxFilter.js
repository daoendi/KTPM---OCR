import { Document, Packer, Paragraph } from "docx";
import { redisClient } from "../utils/redisClient.js";

export async function DocxFilter(ctx) {
  const start = performance.now(); // ⏱️ Bắt đầu đo

  let rawContent = ctx.translated ?? ctx.text ?? "";
  if (Array.isArray(rawContent)) rawContent = rawContent.join("\n");

  const content = String(rawContent).split(/\r?\n/);
  const doc = new Document({
    sections: [{ children: content.map((line) => new Paragraph(line)) }],
  });

  const buffer = await Packer.toBuffer(doc);
  ctx.output = buffer;
  ctx.mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  ctx.filename = `${ctx.title || "Document"}.docx`;

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
        { EX: 60 * 60 }
      );
      console.log("✅ Saved DOCX to cache:", ctx.cacheKey);
    } catch (e) {
      console.error("❌ Error saving DOCX to cache:", e.message);
    }
  }

  const end = performance.now(); // Kết thúc đo
  //  console.log(` DOCX generation time: ${(end - start).toFixed(2)} ms`);

  return ctx;
}
