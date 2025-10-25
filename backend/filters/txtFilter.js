import { redisClient } from "../utils/redisClient.js";

export async function TxtFilter(ctx) {
  const start = performance.now(); // ⏱️ Bắt đầu đo

  let content = ctx.translatedText || ctx.translated || ctx.text || "";
  if (Array.isArray(content)) content = content.join("\n");

  content = String(content)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  ctx.output = Buffer.from(content, "utf-8");
  ctx.mime = "text/plain";
  ctx.filename = `${ctx.title || "Document"}.txt`;

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
      console.log("✅ Saved TXT result to cache:", ctx.cacheKey);
    } catch (e) {
      console.error("❌ Error saving TXT to cache:", e.message);
    }
  }

  const end = performance.now(); //  Kết thúc đo
  //  console.log(` TXT generation time: ${(end - start).toFixed(2)} ms`);

  return ctx;
}
