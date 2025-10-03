// Import các thư viện cần thiết
import express from "express";
import multer from "multer"; // Xử lý upload file
import crypto from "crypto"; // Tạo hash cho cache key
import { LRUCache } from "lru-cache"; // Cache
import path from "path";
import { fileURLToPath } from "url";

// Import các module tự định nghĩa
import { runPipeline } from "./pipeline.js";
import { OCRFilter } from "./filters/ocrFilter.js";
import { TranslateFilter } from "./filters/translateFilter.js";
import { PdfFilter } from "./filters/pdfFilter.js";
import { DocxFilter } from "./filters/docxFilter.js";
import { TxtFilter } from "./filters/txtFilter.js";

// --- Cấu hình server ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Cache: lưu tối đa 200 kết quả trong 1 giờ
const cache = new LRUCache({ max: 200, ttl: 1000 * 60 * 60 });

// Phục vụ các file tĩnh trong thư mục public
app.use(express.static(path.join(__dirname, "public")));

// --- API endpoint ---
app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file ảnh" });

    const {
      targetLang = "vi", // Ngôn ngữ đích
      docTitle = "Converted", // Tiêu đề tài liệu
      outputFormat = "pdf", // Định dạng output
    } = req.body;

    // --- Cache ---
    const key = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .update(targetLang)
      .update(outputFormat)
      .digest("hex");

    if (cache.has(key)) {
      const cached = cache.get(key);
      res.setHeader("Content-Type", cached.mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${cached.filename}"`
      );
      return res.send(cached.buffer);
    }

    // --- Pipeline ---
    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    const ctx = {
      buffer: req.file.buffer,
      targetLang,
      title: docTitle,
    };

    const result = await runPipeline(ctx, [
      OCRFilter,
      TranslateFilter,
      exportFilter,
    ]);

    // Lưu vào cache
    cache.set(key, {
      mime: result.mime,
      filename: result.filename,
      buffer: result.output,
    });

    res.setHeader("Content-Type", result.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    res.send(result.output);
  } catch (err) {
    console.error("❌ Lỗi xử lý:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Khởi động Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
