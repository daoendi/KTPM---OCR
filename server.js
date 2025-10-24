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

// Import OCR worker lifecycle
import { initWorker, terminateWorker } from "./utils/ocr.js";

// ===============================
// Cấu hình đường dẫn hiện tại
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// Cấu hình Express & Multer
// ===============================
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ===============================
// API: Lấy / Reset thống kê cache
// ===============================
app.get("/api/cache-stats", (req, res) => res.json(getCacheStats()));
app.post("/api/cache-reset", (req, res) => {
  resetStats();
  res.json({ message: "Cache stats reset thành công!" });
});

// ===============================
// API: OCR + Translate + Export (1 file)
// ===============================
app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Thiếu file ảnh để xử lý OCR." });
    }

    const {
      targetLang = "vi",
      docTitle = "Converted",
      outputFormat = "pdf",
    } = req.body;

    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    const ctx = {
      buffer: req.file.buffer,
      lang: "eng+vie",
      targetLang,
      title: docTitle,
      outputFormat,
    };

    const result = await runPipeline(ctx, [
      CacheFilter,
      OCRFilter,
      TranslateFilter,
      exportFilter,
    ]);

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

// =====================================================
// ✅ API mới: Xử lý nhiều file song song (tối đa 10, concurrency = 5)
// =====================================================
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 5);

// Giới hạn số tác vụ đồng thời
async function asyncPool(limit, array, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.allSettled(ret);
}

// Route batch xử lý song song
app.post("/api/convert-multi", upload.array("images", 10), async (req, res) => {
  try {
    const { targetLang = "vi", outputFormat = "pdf" } = req.body;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Thiếu file ảnh." });
    }

    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    const results = await asyncPool(
      MAX_CONCURRENCY,
      req.files,
      async (file) => {
        const ctx = {
          buffer: file.buffer,
          lang: "eng+vie",
          targetLang,
          title: file.originalname.replace(/\.[^.]+$/, "") || "Document",
          outputFormat,
        };

        const result = await runPipeline(ctx, [
          CacheFilter,
          OCRFilter,
          TranslateFilter,
          exportFilter,
        ]);

        return {
          originalName: file.originalname,
          filename: result.filename,
          mime: result.mime,
          outputBase64: result.output.toString("base64"),
        };
      }
    );

    const success = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    const failed = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r.reason && r.reason.message) || "Unknown error");

    res.json({ success, failed, concurrency: MAX_CONCURRENCY });
  } catch (err) {
    console.error("Lỗi xử lý batch:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Khởi động server
// ===============================
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    console.log("Khởi tạo OCR worker...");
    await initWorker();

    app.listen(PORT, () => {
      console.log(`✅ API server is running at http://localhost:${PORT}`);
      console.log(`⚙️  Giới hạn đồng thời: ${MAX_CONCURRENCY}`);
    });

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
