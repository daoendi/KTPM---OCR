// filters/txtFilter.js
import { redisClient } from "../utils/redisClient.js";

export async function TxtFilter(ctx) {
  // Lấy nội dung văn bản cuối cùng, đảm bảo nó là một chuỗi.
  let content = ctx.translated ?? ctx.text ?? "";
  if (Array.isArray(content)) {
    content = content.join("\n");
  }

  // Cập nhật context với output dạng text.
  ctx.output = Buffer.from(String(content), "utf-8");
  ctx.mime = "text/plain";
  ctx.filename = `${ctx.title || "Document"}.txt`;

  // Lưu kết quả vào cache nếu có cacheKey và Redis client đã sẵn sàng.
  if (ctx.cacheKey && redisClient?.isOpen) {
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
    console.log("Saved to cache:", ctx.cacheKey);
  }

  return ctx;
}
