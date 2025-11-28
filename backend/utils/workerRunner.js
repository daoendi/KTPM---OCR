// utils/workerRunner.js
import { Worker } from "bullmq";
import { performance } from "perf_hooks";
import { runPipeline } from "../pipeline.js";
import { PreprocessFilter } from "../filters/preprocessFilter.js";
import { OCRFilter } from "../filters/ocrFilter.js";
import { TranslateFilter } from "../filters/translateFilter.js";
import { PdfFilter } from "../filters/pdfFilter.js";
import { DocxFilter } from "../filters/docxFilter.js";
import { TxtFilter } from "../filters/txtFilter.js";
import IORedis from "ioredis";
import { recordHistory } from "./history.js";

let workerInstance = null;
let connection = null;
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export async function startWorker(options = {}) {
  const { concurrency = 3, limiter } = options;
  if (workerInstance) return workerInstance;

  // duplicate redis connection for worker
  connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: "ocr-worker",
    lazyConnect: true,
  });
  await connection.connect();

  workerInstance = new Worker(
    "ocr-jobs",
    async (job) => {
      const start = performance.now();
      try {
        const {
          buffer: base64Buffer,
          targetLang,
          title,
          outputFormat = "pdf",
        } = job.data;
        let buffer;
        if (typeof base64Buffer === "string")
          buffer = Buffer.from(base64Buffer, "base64");
        else if (Buffer.isBuffer(base64Buffer)) buffer = base64Buffer;
        else buffer = Buffer.from(base64Buffer || job.data.buffer || []);

        await job.updateProgress(10);

        const fmt = String(outputFormat || "pdf").toLowerCase();
        let exportFilter = PdfFilter;
        if (fmt === "docx") exportFilter = DocxFilter;
        else if (fmt === "txt") exportFilter = TxtFilter;

        const ctx = {
          buffer,
          lang: "eng+vie",
          targetLang,
          title: title || job.data.title || "Document",
          outputFormat: fmt,
        };

        await job.updateProgress(20);

        const result = await runPipeline(ctx, [
          PreprocessFilter,
          OCRFilter,
          TranslateFilter,
          exportFilter,
        ]);

        await job.updateProgress(80);

        const owner = job.data?.owner || null;
        const historyId = await recordHistory(
          {
            originalName: title || job.data.title || "Document",
            filename: result.filename,
            mime: result.mime,
            outputBase64: result.output.toString("base64"),
            targetLang,
            outputFormat: fmt,
          },
          owner
        );

        await job.updateProgress(90);

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
        throw err;
      }
    },
    {
      connection,
      concurrency,
      limiter,
    }
  );

  workerInstance.on("completed", (job) =>
    console.log(`Job ${job.id} completed`)
  );
  workerInstance.on("failed", (job, err) =>
    console.error(`Job ${job.id} failed: ${err?.message || err}`)
  );

  return workerInstance;
}

export async function stopWorker() {
  if (workerInstance) {
    try {
      await workerInstance.close();
    } catch (e) {
      console.error("Error closing worker:", e);
    }
    workerInstance = null;
  }
  if (connection) {
    try {
      await connection.quit();
    } catch (e) {
      console.error("Error quitting connection:", e);
    }
    connection = null;
  }
}
