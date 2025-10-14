import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// Import pipeline & filters
import { runPipeline } from "./pipeline.js";
import { CacheFilter } from "./filters/cacheFilter.js";
import { OCRFilter } from "./filters/ocrFilter.js";
import { TranslateFilter } from "./filters/translateFilter.js";
import { PdfFilter } from "./filters/pdfFilter.js";
import { DocxFilter } from "./filters/docxFilter.js";
import { TxtFilter } from "./filters/txtFilter.js";

// Import thống kê cache
import { getCacheStats, resetStats } from "./utils/cacheStats.js";

// Import hàm khởi tạo OCR worker
import { initWorker, terminateWorker } from "./utils/ocr.js";

// Cấu hình đường dẫn hiện tại
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// API: Lấy thống kê cache
// ===============================
app.get("/api/cache-stats", (req, res) => {
  res.json(getCacheStats());
});

// API: Reset thống kê cache
app.post("/api/cache-reset", (req, res) => {
  resetStats();
  res.json({ message: "Cache stats reset thành công!" });
});

// ===============================
// API: OCR + Translate + Export
// ===============================
app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Thiếu file ảnh để xử lý OCR." });
    }

    const {
      targetLang = "vi", // Ngôn ngữ đích
      docTitle = "Converted", // Tiêu đề tài liệu
      outputFormat = "pdf", // Định dạng đầu ra
    } = req.body;

    // Xác định filter xuất phù hợp
    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    // Ngữ cảnh pipeline
    const ctx = {
      buffer: req.file.buffer,
      lang: "eng+vie", // Thêm ngôn ngữ OCR
      targetLang,
      title: docTitle,
      outputFormat,
    };

    //console.log("Bắt đầu pipeline OCR + Translate...");

    // Chạy pipeline
    const result = await runPipeline(ctx, [
      CacheFilter, // Kiểm tra & lưu cache
      OCRFilter, // OCR ảnh sang văn bản
      TranslateFilter, // Dịch văn bản
      exportFilter, // Xuất ra định dạng mong muốn
    ]);

    //console.log("Pipeline hoàn tất. Gửi kết quả về client...");

    // Trả kết quả file cho client
    res.setHeader("Content-Type", result.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.output);
  } catch (err) {
    console.error("Lỗi xử lý pipeline:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Khởi động server (với initWorker)
// ===============================
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    console.log("Khởi tạo OCR worker...");
    await initWorker(); // Khởi tạo worker trước khi server chạy

    app.listen(PORT, () => {
      console.log(`API server is running at: http://localhost:${PORT}`);
    });

    // Dọn dẹp worker khi dừng server
    process.on("SIGINT", async () => {
      console.log("\nĐang tắt server, giải phóng worker...");
      await terminateWorker();
      process.exit(0);
    });
  } catch (err) {
    console.error("Lỗi khi khởi tạo OCR worker:", err);
    process.exit(1);
  }
})();
