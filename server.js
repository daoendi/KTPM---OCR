// Import các thư viện cần thiết
import express from "express";
import multer from "multer"; // Xử lý upload file
import crypto from "crypto"; // Tạo hash cho cache key
import { LRUCache } from "lru-cache"; // Tạo bộ nhớ đệm (cache)
import path from "path";
import { fileURLToPath } from "url";

// Import các module tự định nghĩa
import { runPipeline } from "./pipeline.js"; // Hàm chạy pipeline xử lý
import { OCRFilter } from "./filters/ocrFilter.js"; // Filter nhận dạng văn bản
import { TranslateFilter } from "./filters/translateFilter.js"; // Filter dịch văn bản
import { PdfFilter } from "./filters/pdfFilter.js"; // Filter xuất file PDF
import { DocxFilter } from "./filters/docxFilter.js"; // Filter xuất file DOCX
import { TxtFilter } from "./filters/txtFilter.js"; // Filter xuất file TXT

// --- Cấu hình server ---

// Lấy đường dẫn thư mục hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Khởi tạo Express app
const app = express();
// Cấu hình multer để lưu file upload trong bộ nhớ
const upload = multer({ storage: multer.memoryStorage() });

// Cấu hình cache: lưu tối đa 200 kết quả trong 1 giờ
const cache = new LRUCache({ max: 200, ttl: 1000 * 60 * 60 });

// Phục vụ các file tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, "public")));

// --- Định nghĩa API endpoint ---

/**
 * Endpoint chính để xử lý ảnh:
 * 1. Nhận dạng văn bản (OCR)
 * 2. Dịch văn bản
 * 3. Xuất ra file theo định dạng yêu cầu (PDF, DOCX, TXT)
 */
app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    // Kiểm tra file đã được upload chưa
    if (!req.file) return res.status(400).json({ error: "Thiếu file ảnh" });

    // Lấy các tham số từ request body
    const {
      targetLang = "vi", // Ngôn ngữ đích để dịch
      docTitle = "Converted", // Tiêu đề tài liệu
      outputFormat = "pdf", // Định dạng file output
    } = req.body;

    // --- Xử lý Cache ---

    // Tạo cache key duy nhất dựa trên nội dung file và các tham số
    const key = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .update(targetLang)
      .update(outputFormat)
      .digest("hex");

    // Nếu kết quả đã có trong cache, trả về ngay lập tức
    if (cache.has(key)) {
      const cached = cache.get(key);
      res.setHeader("Content-Type", cached.mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${cached.filename}"`
      );
      return res.send(cached.buffer);
    }

    // --- Xử lý Pipeline ---

    // Chọn filter để xuất file dựa trên outputFormat
    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    // Chuẩn bị context object để truyền qua pipeline
    const ctx = {
      buffer: req.file.buffer, // Dữ liệu file ảnh
      targetLang, // Ngôn ngữ đích
      title: docTitle, // Tiêu đề
    };

    // Chạy pipeline với các filter đã chọn
    const result = await runPipeline(ctx, [
      OCRFilter, // Bước 1: Nhận dạng văn bản
      TranslateFilter, // Bước 2: Dịch
      exportFilter, // Bước 3: Xuất file
    ]);

    // Lưu kết quả vào cache
    cache.set(key, {
      mime: result.mime,
      filename: result.filename,
      buffer: result.output,
    });

    // Trả kết quả về cho client
    res.setHeader("Content-Type", result.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.output);
  } catch (err) {
    // Xử lý lỗi nếu có
    console.error("Lỗi xử lý:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Khởi động Server ---
app.listen(3000, () => {
  console.log("🚀 Server chạy tại http://localhost:3000");
});
