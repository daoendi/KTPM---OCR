// filters/cacheFilter.js
import crypto from "crypto";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

export async function CacheFilter(ctx) {
  // Tạo key cache duy nhất từ buffer + ngôn ngữ đích + định dạng output
  const key = crypto
    .createHash("sha256")
    .update(ctx.buffer)
    .update(ctx.targetLang)
    .update(ctx.outputFormat)
    .digest("hex");

  // Kiểm tra cache trong Redis
  const cached = await redisClient.get(key);

  if (cached) {
    //console.log("Cache HIT:", key);
    recordHit();

    const parsed = JSON.parse(cached);
    ctx.fromCache = true;
    ctx.text = parsed.text;
    ctx.translated = parsed.translated;
    ctx.mime = parsed.mime;
    ctx.filename = parsed.filename;
    ctx.output = Buffer.from(parsed.output, "base64");

    // Quan trọng: chỉ cần return ctx, KHÔNG GỌI next()
    return ctx;
  }

  //console.log("Cache MISS:", key);
  recordMiss();

  // Nếu không có cache, gắn key vào ctx để các filter sau dùng khi ghi cache
  ctx.cacheKey = key;

  // Không gọi next() nữa — chỉ return ctx để pipeline chuyển sang filter kế tiếp
  return ctx;
}
