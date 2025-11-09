import Tesseract from "tesseract.js";
import sharp from "sharp";

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
async function preprocessImage(buffer) {
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
export async function ocrImageToText(buffer, lang = "eng+vie") {
  try {
    // Áp dụng các bước tiền xử lý cho ảnh.
    const preprocessed = await preprocessImage(buffer);

    // Gọi Tesseract để nhận dạng văn bản từ ảnh đã xử lý.
    const {
      data: { text },
    } = await Tesseract.recognize(preprocessed, lang, {
      // Tắt logger để tránh in ra quá nhiều thông tin không cần thiết.
      logger: (m) => {},
    });

    // Trả về văn bản đã được trim (loại bỏ khoảng trắng thừa).
    return text.trim();
  } catch (err) {
    console.error("Lỗi OCR:", err);
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
  // Khi server khởi động, import module workerRunner để khởi tạo Worker
  // (module có top-level await và sẽ tạo Worker khi được import).
  try {
    await import("./workerRunner.js");
    console.log("Worker consumer đã được khởi tạo.");
  } catch (err) {
    console.error("Không thể khởi tạo worker:", err);
    throw err;
  }
}

export async function terminateWorker() {
  // Thực hiện đóng worker nếu module đã được import
  try {
    const mod = await import("./workerRunner.js");
    if (mod && mod.worker && typeof mod.worker.close === "function") {
      await mod.worker.close();
      console.log("Worker consumer đã đóng.");
    }
  } catch (err) {
    console.error("Lỗi khi đóng worker:", err);
  }
}
