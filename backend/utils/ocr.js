import Tesseract from "tesseract.js";
import sharp from "sharp";

/**
 * Tiền xử lý ảnh để tăng độ chính xác
 */
async function preprocessImage(buffer) {
  return sharp(buffer)
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(160)
    .toBuffer();
}

/**
 * Hàm OCR chính - sử dụng trực tiếp Tesseract.recognize
 * @param {Buffer} buffer - ảnh gốc
 * @param {string} lang - ngôn ngữ OCR (vd: "eng", "vie", "eng+vie")
 */
export async function ocrImageToText(buffer, lang = "eng+vie") {
  try {
    const preprocessed = await preprocessImage(buffer);

    const {
      data: { text },
    } = await Tesseract.recognize(preprocessed, lang, {
      logger: (m) => {},
    });

    return text.trim();
  } catch (err) {
    console.error("Lỗi OCR:", err);
    throw new Error("OCR thất bại. Kiểm tra ảnh hoặc ngôn ngữ.");
  }
}

/**
 * Hàm initWorker & terminateWorker giữ nguyên để không làm hỏng pipeline
 * (Nhưng không làm gì cả, vì v4 không cần worker)
 */
export async function initWorker() {}

export async function terminateWorker() {}
