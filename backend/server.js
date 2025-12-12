// server.js
// Load environment variables from .env when present
import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
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
// Import utils: cache stats, OCR worker, Redis, Queue
// ===============================
import { getCacheStats, resetStats } from "./utils/cacheStats.js";
import { recordHistory } from "./utils/history.js";
import { initWorker, terminateWorker } from "./utils/ocr.js";
import { redisClient } from "./utils/redisClient.js";
import { jobQueue } from "./utils/queue.js";
import { getJobState } from "./utils/jobState.js";
import { getAll as getAllMetrics } from "./utils/metrics.js";
import authRoutes from "./routes/auth.js";
import verifyToken from "./middleware/verifyToken.js";
import jwt from "jsonwebtoken";
import healthRouter from "./routes/health.js";

const JWT_SECRET = process.env.JWT_SECRET || "daoendi";
if (!JWT_SECRET) {
  console.warn(
    "WARNING: JWT_SECRET is not set. Authentication tokens will be insecure or may fail. Set JWT_SECRET in your environment."
  );
}
// ===============================
// Cấu hình đường dẫn
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// Cấu hình Express
// ===============================
const app = express();
// allow cross-origin requests with credentials (cookies) when developing
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// Connect to MongoDB for user accounts (optional)
// Use `MONGO_URI` from environment — do NOT keep credentials hardcoded here.
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI, { autoIndex: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch((e) => console.warn("MongoDB connection failed:", e.message));
} else {
  console.log(
    "MONGO_URI not set; skipping MongoDB connection (user accounts disabled)."
  );
}

// Mount auth routes
app.use("/api/auth", authRoutes);

// Mount health route at root: GET /health
app.use("/", healthRouter);

// ===============================
// Cấu hình Limiter
// ===============================
import { globalLimiter } from "./middleware/rateLimiters/globalLimiter.js";
import { createTaskLimiter } from "./middleware/rateLimiters/taskLimiter.js";
import createUserThrottler from "./middleware/rateLimiters/userThrottler.js";
import usageMonitor from "./middleware/usageMonitor.js";

// Respect reverse proxy settings so `req.ip` and `X-Forwarded-For` are handled
// Set `TRUST_PROXY=1` in production if behind a proxy (nginx/Heroku/Cloudflare)
if (process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
  console.log("Express trust proxy enabled (TRUST_PROXY=1)");
}

// Áp dụng default limiter cho toàn API đường dẫn /api nếu muốn
app.use("/api", globalLimiter);
const uploadLimiter = createTaskLimiter(
  "upload",
  parseInt(process.env.RATE_UPLOAD_MAX || "30", 10)
);
const ocrLimiter = createTaskLimiter(
  "ocr",
  parseInt(process.env.RATE_OCR_MAX || "20", 10)
);
const batchLimiter = createTaskLimiter(
  "batch",
  parseInt(process.env.RATE_BATCH_MAX || "10", 10)
);

// User-level throttling (delays instead of rejecting)
// Configure via env: THROTTLE_DELAY_AFTER, THROTTLE_WINDOW_SECONDS
const userThrottler = createUserThrottler(
  parseInt(process.env.THROTTLE_DELAY_AFTER || "15", 10),
  parseInt(process.env.THROTTLE_WINDOW_SECONDS || "30", 10)
);

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

// API: simple metrics endpoint (returns Redis-backed counters)
app.get("/api/metrics", async (req, res) => {
  try {
    const m = await getAllMetrics();
    res.json(m);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =====================================================
// API: Xử lý 1 file (đồng bộ - chạy trực tiếp pipeline)
// Dùng cho demo hoặc file nhỏ vì request sẽ bị chặn cho tới khi OCR hoàn tất.
// =====================================================
app.post(
  "/api/convert-sync",
  userThrottler,
  uploadLimiter,
  ocrLimiter,
  upload.single("image"),
  async (req, res) => {
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
        // determine owner from token if present (do not require auth for processing)
        const auth =
          req.headers.authorization || req.headers.Authorization || "";
        const headerToken =
          auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
        const cookieToken = req.cookies && req.cookies.token;
        const token = headerToken || cookieToken || req.query?.token;
        let owner = null;
        if (token) {
          try {
            const payload = jwt.verify(token, JWT_SECRET);
            owner = payload.sub;
          } catch (e) {
            // ignore invalid token - treat as anonymous
          }
        }
        if (owner) {
          await recordHistory(
            {
              originalName: req.file.originalname,
              filename: result.filename,
              mime: result.mime,
              outputBase64: result.output.toString("base64"),
              targetLang,
              outputFormat: fmt,
            },
            owner
          );
        }
      } catch (e) {
        console.error("Failed to record history:", e);
      }

      res.setHeader("Content-Type", result.mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.filename}"`
      );
      // Indicate if any part of the pipeline returned a cached fallback
      const cacheFallbackUsed =
        Boolean(result.ocrCacheFallback) ||
        Boolean(result.translateCacheFallback) ||
        Boolean(result.exportFromCache);
      if (cacheFallbackUsed) {
        res.setHeader("X-Cache-Fallback", "true");
      }
      res.send(result.output);
    } catch (err) {
      console.error("Lỗi xử lý pipeline:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================
// API: Xử lý 1 file qua hàng đợi Message Queue (không blocking)
// =====================================================
app.post(
  "/api/convert-async",
  userThrottler,
  uploadLimiter,
  ocrLimiter,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "Thiếu file ảnh để xử lý." });

      const {
        targetLang = "vi",
        docTitle = "Converted",
        outputFormat = "pdf",
      } = req.body;

      // try to capture owner id (if user has a valid token cookie/header)
      const auth = req.headers.authorization || req.headers.Authorization || "";
      const headerToken =
        auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
      const cookieToken = req.cookies && req.cookies.token;
      const token = headerToken || cookieToken || req.query?.token;
      let owner = null;
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET);
          owner = payload.sub;
        } catch (e) {
          // ignore invalid token
        }
      }

      const job = await jobQueue.add("ocr-task", {
        buffer: req.file.buffer.toString("base64"),
        targetLang,
        title: docTitle,
        outputFormat,
        owner,
      });

      res.json({ jobId: job.id, message: "Job đã được thêm vào hàng đợi." });
    } catch (err) {
      console.error("Lỗi thêm job:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// =====================================================
// API: Lấy trạng thái hoặc kết quả job
// =====================================================
app.get("/api/job/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const state = await getJobState(id);
    // If we are returning a completed job with a result that used cache fallback,
    // set the X-Cache-Fallback header for clients that consume the binary/result separately.
    const used =
      state?.result &&
      (state.result.ocrCacheFallback ||
        state.result.translateCacheFallback ||
        state.result.exportFromCache);
    if (used) res.setHeader("X-Cache-Fallback", "true");
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

app.post(
  "/api/convert-multi",
  uploadLimiter,
  batchLimiter,
  upload.array("images", 10),
  async (req, res) => {
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
            const auth =
              req.headers.authorization || req.headers.Authorization || "";
            const headerToken =
              auth && auth.startsWith("Bearer ") ? auth.slice(7) : null;
            const cookieToken = req.cookies && req.cookies.token;
            const token = headerToken || cookieToken || req.query?.token;
            let owner = null;
            if (token) {
              try {
                const payload = jwt.verify(token, JWT_SECRET);
                owner = payload.sub;
              } catch (e) {
                // ignore invalid token
              }
            }
            if (owner) {
              await recordHistory(
                {
                  originalName: file.originalname,
                  filename: result.filename,
                  mime: result.mime,
                  outputBase64: result.output.toString("base64"),
                  targetLang,
                  outputFormat: fmt,
                },
                owner
              );
            }
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
  }
);

// API: Lấy lịch sử OCR gần đây
app.get("/api/ocr-history", verifyToken, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "50", 10));
    const { getHistory } = await import("./utils/history.js");
    // Mặc định bỏ qua base64 để tải nhanh hơn
    const owner = req.user?.sub;
    const list = await getHistory(limit, true, owner);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Tải về nội dung lịch sử theo id
app.get("/api/ocr-history/:id/download", verifyToken, async (req, res) => {
  try {
    const { getHistoryItem } = await import("./utils/history.js");
    const id = req.params.id;
    const owner = req.user?.sub;
    const item = await getHistoryItem(id, owner);
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
app.post("/api/ocr-history/clear", verifyToken, async (req, res) => {
  try {
    const { clearHistory } = await import("./utils/history.js");
    const owner = req.user?.sub;
    await clearHistory(owner);
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
