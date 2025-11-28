// server.js
import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// ===============================
// Import pipeline & filters
// ===============================
import { runPipeline } from "./pipeline.js";
import { PreprocessFilter } from "./filters/preprocessFilter.js";
import { OCRFilter } from "./filters/ocrFilter.js";
import { TranslateFilter } from "./filters/translateFilter.js";
import { PdfFilter } from "./filters/pdfFilter.js";
import { DocxFilter } from "./filters/docxFilter.js";
import { TxtFilter } from "./filters/txtFilter.js";

// ===============================
// Import midleware: rate limiter
// ===============================
import { limiter as rateLimiter } from "./middleware/rateLimiter.js";

// ===============================
// Import utils: cache stats, OCR worker, Redis, Queue
// ===============================
import { getCacheStats, resetStats } from "./utils/cacheStats.js";
import { recordHistory } from "./utils/history.js";
import { initWorker, terminateWorker } from "./utils/ocr.js";
import { redisClient } from "./utils/redisClient.js";
import { jobQueue } from "./utils/queue.js";
import { getJobState } from "./utils/jobState.js";

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
  limits: { fileSize: 50 * 1024 * 1024, files: 10 }, // 50MB/file
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
// Dùng cho demo hoặc file nhỏ vì request sẽ bị chặn cho tới khi OCR hoàn tất.
// =====================================================
app.post("/api/convert-sync", rateLimiter, upload.single("image"), async (req, res) => {
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
      PreprocessFilter,
      OCRFilter,
      TranslateFilter,
      exportFilter,
    ]);

    // Ghi lịch sử xử lý để hiển thị nhanh ở UI
    try {
      await recordHistory({
        originalName: req.file.originalname,
        filename: result.filename,
        mime: result.mime,
        outputBase64: result.output.toString("base64"),
        targetLang,
        outputFormat: fmt,
      });
    } catch (e) {
      console.error("Failed to record history:", e);
    }

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
app.post("/api/convert-async", rateLimiter, upload.single("image"), async (req, res) => {
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
    const state = await getJobState(id);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Hủy job đang chạy
app.delete("/api/job/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const job = await jobQueue.getJob(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    await job.remove();
    res.json({ message: "Job cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Retry failed job
app.post("/api/job/:id/retry", async (req, res) => {
  const { id } = req.params;
  try {
    const job = await jobQueue.getJob(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    await job.retry();
    res.json({ message: "Job queued for retry" });
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

app.post("/api/convert-multi", rateLimiter, upload.array("images", 10), async (req, res) => {
  try {
    const { targetLang = "vi", outputFormat = "pdf" } = req.body;
    if (!req.files?.length)
      return res.status(400).json({ error: "Thiếu file ảnh." });

    const fmt = String(outputFormat || "").toLowerCase();
    let exportFilter = PdfFilter;
    if (fmt === "docx") exportFilter = DocxFilter;
    else if (fmt === "txt") exportFilter = TxtFilter;

    // Use number of uploaded files as concurrency limit to avoid artificial caps
    const concurrencyLimit = Math.max(1, req.files.length || MAX_CONCURRENCY);

    const results = await asyncPool(
      concurrencyLimit,
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
          PreprocessFilter,
          OCRFilter,
          TranslateFilter,
          exportFilter,
        ]);
        // ghi lịch sử từng file
        try {
          await recordHistory({
            originalName: file.originalname,
            filename: result.filename,
            mime: result.mime,
            outputBase64: result.output.toString("base64"),
            targetLang,
            outputFormat: fmt,
          });
        } catch (e) {
          console.error(
            "Failed to record history for file:",
            file.originalname,
            e
          );
        }
        return {
          originalName: file.originalname,
          filename: result.filename,
          mime: result.mime,
          outputBase64: result.output.toString("base64"),
        };
      }
    );

    const decorated = results.map((res, idx) => ({
      res,
      file: req.files[idx],
      index: idx,
    }));

    const success = decorated
      .filter(({ res }) => res.status === "fulfilled")
      .map(({ res }) => res.value);

    const failed = decorated
      .filter(({ res }) => res.status === "rejected")
      .map(({ res, file, index }) => ({
        originalName: file?.originalname || `File ${index + 1}`,
        error: res.reason?.message || "Unknown error",
      }));

    res.json({ success, failed, concurrency: MAX_CONCURRENCY });
  } catch (err) {
    console.error("Lỗi xử lý batch:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Lấy lịch sử OCR gần đây
app.get("/api/ocr-history", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "50", 10));
    const { getHistory } = await import("./utils/history.js");
    // Mặc định bỏ qua base64 để tải nhanh hơn
    const list = await getHistory(limit, true);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Tải về nội dung lịch sử theo id
app.get("/api/ocr-history/:id/download", async (req, res) => {
  try {
    const { getHistoryItem } = await import("./utils/history.js");
    const id = req.params.id;
    const item = await getHistoryItem(id);
    if (!item) return res.status(404).json({ error: "Not found" });

    const buf = Buffer.from(item.outputBase64 || "", "base64");
    res.setHeader("Content-Type", item.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${
        item.filename || item.originalName || "download"
      }"`
    );
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Xóa toàn bộ lịch sử OCR
app.post("/api/ocr-history/clear", async (req, res) => {
  try {
    const { clearHistory } = await import("./utils/history.js");
    await clearHistory();
    res.json({ message: "History cleared successfully" });
  } catch (err) {
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
const PORT = parseInt(process.env.PORT || "3000", 10);

(async () => {
  try {
    console.log("Khởi tạo OCR worker...");
    await initWorker();
    await new Promise((resolve, reject) => {
      const server = app.listen(PORT, () => {
        console.log(`🚀 API server chạy tại http://localhost:${PORT}`);
        console.log(`⚙️  Giới hạn đồng thời: ${MAX_CONCURRENCY}`);
        resolve(server);
      });
      server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          console.error(
            `Cổng ${PORT} đang được sử dụng. Hãy tắt tiến trình khác hoặc đặt PORT khác rồi thử lại.`
          );
        }
        reject(err);
      });
    });

    process.on("SIGINT", async () => {
      console.log("\nĐang tắt server, giải phóng worker...");
      await terminateWorker();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      console.log("\nSIGTERM nhận được, đang tắt server...");
      await terminateWorker();
      process.exit(0);
    });
  } catch (err) {
    console.error("Lỗi khi khởi tạo server:", err);
    process.exit(1);
  }
})();
