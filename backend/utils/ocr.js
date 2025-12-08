import Tesseract from "tesseract.js";
import sharp from "sharp";
import crypto from "crypto";
import { startWorker, stopWorker } from "./workerRunner.js";
import { createBreaker } from "./circuitBreaker.js";
import { redisClient } from "./redisClient.js";
import { incr } from "./metrics.js";

// Create a circuit breaker for Tesseract recognition
const tesseractRecognize = async (input, lang, opts) => {
  // tesseract.recognize returns a Promise
  return await Tesseract.recognize(input, lang, opts);
};
const tesseractBreaker = createBreaker(tesseractRecognize, {
  name: "tesseract",
  timeout: parseInt(process.env.CB_TESS_TIMEOUT || "10000", 10),
  errorThresholdPercentage: parseInt(
    process.env.CB_TESS_ERROR_THRESHOLD || "50",
    10
  ),
  resetTimeout: parseInt(process.env.CB_TESS_RESET_TIMEOUT || "30000", 10),
});

/**
 * Tiền xử lý ảnh bằng thư viện Sharp để cải thiện độ chính xác của OCR.
 * Các bước xử lý bao gồm:
 * - Chuyển ảnh sang thang độ xám (grayscale).
 * - Chuẩn hóa độ tương phản (normalize).
 * - Tăng độ sắc nét (sharpen).
 * - Áp dụng ngưỡng nhị phân hóa (threshold) để làm nổi bật văn bản.
 * @param {Buffer} buffer - Buffer của ảnh gốc.
 * @returns {Promise<Buffer>} - Buffer của ảnh đã được tiền xử lý.
 */
export async function preprocessImage(buffer) {
  return sharp(buffer)
    .grayscale() // Chuyển sang ảnh xám
    .normalize() // Tăng cường độ tương phản
    .sharpen() // Làm nét ảnh
    .threshold(160) // Chuyển ảnh thành đen trắng dựa trên ngưỡng
    .toBuffer();
}

/**
 * Thực hiện nhận dạng ký tự quang học (OCR) trên một buffer ảnh.
 * @param {Buffer} buffer - Buffer của ảnh cần xử lý.
 * @param {string} [lang="eng+vie"] - Chuỗi ngôn ngữ cho Tesseract (ví dụ: "eng", "vie", "eng+vie").
 * @returns {Promise<string>} - Văn bản đã được nhận dạng.
 * @throws {Error} Nếu quá trình OCR gặp lỗi.
 */
export async function ocrImageToText(buffer, lang = "eng+vie", options = {}) {
  const { preprocessed = false } = options;
  try {
    // Áp dụng tiền xử lý nếu caller chưa làm.
    const input = preprocessed ? buffer : await preprocessImage(buffer);

    // Gọi Tesseract để nhận dạng văn bản từ ảnh đã xử lý.
    const {
      data: { text },
    } = await tesseractBreaker.fire(input, lang, {
      // Tắt logger để tránh in ra quá nhiều thông tin không cần thiết.
      logger: (m) => {},
    });

    // Trả về văn bản đã được trim (loại bỏ khoảng trắng thừa).
    return { text: text.trim(), cacheFallback: false };
  } catch (err) {
    console.error("Lỗi OCR (breaker or runtime):", err);
    // Attempt cache fallback: compute hash of the preprocessed input and check Redis
    try {
      const hash = crypto
        .createHash("sha256")
        .update(preprocessed ? buffer : await preprocessImage(buffer))
        .digest("hex");
      const cacheKey = `ocr:text:${hash}:${lang}`;
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.text) {
            console.info("OCR breaker fallback: returning cached OCR text");
            try {
              incr("cache_fallback_count");
            } catch (e) {}
            return { text: parsed.text, cacheFallback: true };
          }
        } catch (e) {
          // cached might be plain text
          console.info("OCR breaker fallback: returning cached plain text");
          try {
            incr("cache_fallback_count");
          } catch (e) {}
          return { text: String(cached), cacheFallback: true };
        }
      }
    } catch (cacheErr) {
      console.warn(
        "OCR fallback cache check failed:",
        cacheErr?.message || cacheErr
      );
    }

    throw new Error(
      "OCR thất bại. Vui lòng kiểm tra lại file ảnh hoặc ngôn ngữ đã chọn."
    );
  }
}

/**
 * Tesseract.js phiên bản 4+ không yêu cầu khởi tạo worker một cách tường minh
 * như các phiên bản cũ. Việc quản lý worker được thực hiện tự động.
 * Các hàm này được giữ lại dưới dạng rỗng để đảm bảo tính tương thích
 * với cấu trúc mã hiện tại mà không gây ra lỗi.
 */
export async function initWorker() {
  try {
    await startWorker({
      concurrency: Number(process.env.WORKER_CONCURRENCY || "3"),
    });
    console.log("Worker consumer đã được khởi tạo.");
  } catch (err) {
    console.error("Không thể khởi tạo worker:", err);
    throw err;
  }
}

export async function terminateWorker() {
  try {
    await stopWorker();
    console.log("Worker consumer đã đóng.");
  } catch (err) {
    console.error("Lỗi khi đóng worker:", err);
  }
}
