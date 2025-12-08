import crypto from "crypto";
import { preprocessImage } from "../utils/ocr.js";
import { redisClient } from "../utils/redisClient.js";
import { recordHit, recordMiss } from "../utils/cacheStats.js";

const PREPROCESS_CACHE_TTL = parseInt(process.env.CACHE_PRE_TTL || "86400", 10); // default 24h

/**
 * Filter tiền xử lý ảnh và cache kết quả để tái sử dụng cho các lần OCR khác nhau.
 * Cache key dựa trên hash của ảnh gốc, nên một ảnh có thể phục vụ nhiều yêu cầu dịch/xuất khác nhau.
 */
export async function PreprocessFilter(ctx) {
    if (!ctx ?.buffer) {
        throw new Error("PreprocessFilter: ctx.buffer is required");
    }

    const rawImageHash = crypto
        .createHash("sha256")
        .update(ctx.buffer)
        .digest("hex");
    ctx.rawImageHash = rawImageHash;

    const cacheKey = `ocr:pre:${rawImageHash}`;
    const cached = await redisClient.get(cacheKey);

    if (cached) {
        recordHit("preprocess");
        ctx.preprocessedBuffer = Buffer.from(cached, "base64");
        ctx.preprocessFromCache = true;
    } else {
        recordMiss("preprocess");
        const processed = await preprocessImage(ctx.buffer);
        ctx.preprocessedBuffer = processed;
        ctx.preprocessFromCache = false;
        try {
            await redisClient.set(
                cacheKey,
                processed.toString("base64"),
                "EX",
                PREPROCESS_CACHE_TTL
            );
        } catch (err) {
            console.error("Failed to cache preprocessed image", err);
        }
    }

    ctx.preprocessedHash = crypto
        .createHash("sha256")
        .update(ctx.preprocessedBuffer)
        .digest("hex");

    return ctx;
}