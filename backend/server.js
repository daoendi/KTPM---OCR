// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { performance } from "perf_hooks";

// ===============================
// Import pipeline & filters
// ===============================
import { runPipeline } from "./pipeline.js";
import { CacheFilter } from "./filters/cacheFilter.js";
import { CacheStoreFilter } from "./filters/cacheStoreFilter.js";
import { OCRFilter } from "./filters/ocrFilter.js";
import { TranslateFilter } from "./filters/translateFilter.js";
import { PdfFilter } from "./filters/pdfFilter.js";
import { DocxFilter } from "./filters/docxFilter.js";
import { TxtFilter } from "./filters/txtFilter.js";

// ===============================
// Import utils: cache stats, OCR worker, Redis, Queue
// ===============================
import { getCacheStats, resetStats } from "./utils/cacheStats.js";
import { initWorker, terminateWorker } from "./utils/ocr.js";
import { redisClient } from "./utils/redisClient.js";
import { jobQueue } from "./utils/queue.js";

// ===============================
// Cấu hình đường dẫn
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// Cấu hình Express
// ===============================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// ===============================
// Cấu hình Multer
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB/file
  fileFilter: (req, file, cb) => {
    const ok = /image\/(png|jpeg|jpg|bmp|tiff|webp)/i.test(file.mimetype);
    if (!ok) return cb(new Error("Chỉ chấp nhận ảnh PNG/JPEG/BMP/TIFF/WEBP"));
    cb(null, true);
  },
});

// ===============================
// Healthcheck
// ===============================
app.get("/healthz", (req, res) =>
  res.json({ ok: true, redis: redisClient.isOpen })
);

// ===============================
// API: Lấy / Reset thống kê cache
// ===============================
app.get("/api/cache-stats", (req, res) => res.json(getCacheStats()));
app.post("/api/cache-reset", (req, res) => {
  resetStats();
  res.json({ message: "Cache stats reset thành công!" });
});

// =====================================================
// API: Xử lý 1 file (đồng bộ - chạy trực tiếp pipeline)
// =====================================================
app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Thiếu file ảnh để xử lý." });

    const {
      targetLang = "vi",
      docTitle = "Converted",
      outputFormat = "pdf",
    } = req.body;
    const fmt = String(outputFormat || "").toLowerCase();
    let exportFilter = PdfFilter;
    if (fmt === "docx") exportFilter = DocxFilter;
    else if (fmt === "txt") exportFilter = TxtFilter;

    const ctx = {
      buffer: req.file.buffer,
      lang: "eng+vie",
      targetLang,
      title: docTitle,
      outputFormat: fmt,
    };

    const result = await runPipeline(ctx, [
      CacheFilter,
      OCRFilter,
      TranslateFilter,
      exportFilter,
      CacheStoreFilter,
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
// API: Xử lý 1 file qua hàng đợi Message Queue (không blocking)
// =====================================================
app.post("/api/convert-async", upload.single("image"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Thiếu file ảnh để xử lý." });

    const {
      targetLang = "vi",
      docTitle = "Converted",
      outputFormat = "pdf",
    } = req.body;

    const job = await jobQueue.add("ocr-task", {
      buffer: req.file.buffer.toString("base64"),
      targetLang,
      title: docTitle,
      outputFormat,
    });

    res.json({ jobId: job.id, message: "Job đã được thêm vào hàng đợi." });
  } catch (err) {
    console.error("Lỗi thêm job:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// API: Lấy trạng thái hoặc kết quả job
// =====================================================
app.get("/api/job/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await redisClient.get(`job:${id}:result`);
    if (!result) return res.json({ status: "processing" });
    const parsed = JSON.parse(result);
    res.json({ status: "done", ...parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================================================
// API: Batch nhiều file (song song, concurrency = 5)
// =====================================================
const MAX_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENCY || "5", 10)
);

async function asyncPool(limit, array, iteratorFn) {
  const ret = [];
  const executing = new Set();
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.allSettled(ret);
}

app.post("/api/convert-multi", upload.array("images", 10), async (req, res) => {
  try {
    const { targetLang = "vi", outputFormat = "pdf" } = req.body;
    if (!req.files?.length)
      return res.status(400).json({ error: "Thiếu file ảnh." });

    const fmt = String(outputFormat || "").toLowerCase();
    let exportFilter = PdfFilter;
    if (fmt === "docx") exportFilter = DocxFilter;
    else if (fmt === "txt") exportFilter = TxtFilter;

    const results = await asyncPool(
      MAX_CONCURRENCY,
      req.files,
      async (file) => {
        const ctx = {
          buffer: file.buffer,
          lang: "eng+vie",
          targetLang,
          title: file.originalname.replace(/\.[^.]+$/, "") || "Document",
          outputFormat: fmt,
        };
        const result = await runPipeline(ctx, [
          CacheFilter,
          OCRFilter,
          TranslateFilter,
          exportFilter,
          CacheStoreFilter,
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
      .map((r) => r.reason?.message || "Unknown error");

    res.json({ success, failed, concurrency: MAX_CONCURRENCY });
  } catch (err) {
    console.error("Lỗi xử lý batch:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Catch-all: Client-side routing
// ===============================
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"))
);

// ===============================
// Middleware bắt lỗi tổng quát
// ===============================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ error: "Internal Server Error", details: err.message });
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
      console.log(`🚀 API server chạy tại http://localhost:${PORT}`);
      console.log(`⚙️  Giới hạn đồng thời: ${MAX_CONCURRENCY}`);
    });

    process.on("SIGINT", async () => {
      console.log("\nĐang tắt server, giải phóng worker...");
      await terminateWorker();
      process.exit(0);
    });
  } catch (err) {
    console.error("Lỗi khi khởi tạo server:", err);
    process.exit(1);
  }
})();
