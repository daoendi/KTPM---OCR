// worker.js - Separate worker process
import { Worker } from "bullmq";
import { performance } from "perf_hooks";
import { redisClient } from "./redisClient.js";
import { runPipeline } from "../pipeline.js";
import { PreprocessFilter } from "../filters/preprocessFilter.js";
import { OCRFilter } from "../filters/ocrFilter.js";
import { TranslateFilter } from "../filters/translateFilter.js";
import { PdfFilter } from "../filters/pdfFilter.js";
import { DocxFilter } from "../filters/docxFilter.js";
import { TxtFilter } from "../filters/txtFilter.js";
import { initWorker, terminateWorker } from "./ocr.js";
import { recordHistory } from "./history.js";

// Khởi tạo OCR worker khi bắt đầu
await initWorker();

// Khởi tạo Redis connection cho worker
const connection = redisClient.duplicate();
await connection.connect();

// Xử lý worker process cleanup
process.on("SIGTERM", async () => {
  console.log("Worker đang dừng...");
  await terminateWorker();
  await connection.quit();
  process.exit(0);
});

process.on("uncaughtException", async (err) => {
  console.error("Lỗi nghiêm trọng trong worker:", err);
  await terminateWorker();
  await connection.quit();
  process.exit(1);
});

// Khởi tạo BullMQ worker
const worker = new Worker(
  "ocr-jobs",
  async (job) => {
    const start = performance.now();

    try {
      // Parse input
      const {
        buffer: base64Buffer,
        targetLang,
        outputFormat = "pdf",
      } = job.data;
      const buffer = Buffer.from(base64Buffer, "base64");

      // Update progress
      await job.updateProgress(10);

      // Chọn export filter
      const fmt = String(outputFormat).toLowerCase();
      let exportFilter = PdfFilter;
      if (fmt === "docx") exportFilter = DocxFilter;
      else if (fmt === "txt") exportFilter = TxtFilter;

      // Xử lý OCR và dịch
      const ctx = {
        buffer,
        lang: "eng+vie",
        targetLang,
        title: job.data.title || "Document",
        outputFormat: fmt,
      };

      await job.updateProgress(20);

      // Chạy pipeline
      const result = await runPipeline(ctx, [
        PreprocessFilter,
        OCRFilter,
        TranslateFilter,
        exportFilter,
      ]);

      await job.updateProgress(80);

      // Lưu lịch sử (gắn owner nếu job cung cấp)
      const owner = job.data?.owner || null;
      const historyId = await recordHistory(
        {
          originalName: job.data.title || "Document",
          filename: result.filename,
          mime: result.mime,
          outputBase64: result.output.toString("base64"),
          targetLang,
          outputFormat: fmt,
        },
        owner
      );

      await job.updateProgress(90);

      // Lưu kết quả vào Redis với TTL 1 giờ
      await connection.set(
        `job:${job.id}:result`,
        JSON.stringify({
          success: true,
          filename: result.filename,
          mime: result.mime,
          outputBase64: result.output.toString("base64"),
          historyId,
          processingTime: Math.round(performance.now() - start),
        }),
        "EX",
        3600
      );

      await job.updateProgress(100);

      return { success: true, historyId };
    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
      throw err; // Để BullMQ handle retry
    }
  },
  {
    connection,
    concurrency: 5, // Số jobs xử lý đồng thời
    limiter: {
      max: 10, // Số jobs tối đa trong 1 khoảng thời gian
      duration: 1000, // Thời gian tính bằng ms
    },
    settings: {
      retryProcessDelay: 5000, // Delay giữa các lần retry
      maxStalledCount: 2, // Số lần job bị stalled trước khi fail
    },
  }
);

// Theo dõi events
worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err);
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

console.log("🚀 Worker process started");
