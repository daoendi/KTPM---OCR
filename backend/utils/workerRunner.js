// utils/workerRunner.js
import { Worker } from "bullmq";
import { runPipeline } from "../pipeline.js";
import { OCRFilter } from "../filters/ocrFilter.js";
import { TranslateFilter } from "../filters/translateFilter.js";
import { PdfFilter } from "../filters/pdfFilter.js";
import { DocxFilter } from "../filters/docxFilter.js";
import { TxtFilter } from "../filters/txtFilter.js";
import { CacheFilter } from "../filters/cacheFilter.js";
import { CacheStoreFilter } from "../filters/cacheStoreFilter.js";
import { redisClient } from "./redisClient.js";

const connection = redisClient.duplicate();
await connection.connect();

export const worker = new Worker(
  "ocr-jobs",
  async (job) => {
    const { buffer, targetLang, title, outputFormat } = job.data;

    let exportFilter = PdfFilter;
    if (outputFormat === "docx") exportFilter = DocxFilter;
    if (outputFormat === "txt") exportFilter = TxtFilter;

    const ctx = {
      buffer: Buffer.from(buffer, "base64"),
      lang: "eng+vie",
      targetLang,
      title,
      outputFormat,
    };

    const result = await runPipeline(ctx, [
      CacheFilter,
      OCRFilter,
      TranslateFilter,
      exportFilter,
      CacheStoreFilter,
    ]);

    // Lưu kết quả vào Redis để client lấy
    await redisClient.set(
      `job:${job.id}:result`,
      JSON.stringify({
        filename: result.filename,
        mime: result.mime,
        outputBase64: result.output.toString("base64"),
      }),
      { EX: 3600 }
    );

    return { filename: result.filename };
  },
  { connection, concurrency: 3 } // 3 job cùng lúc
);

worker.on("completed", (job) =>
  console.log(`Job ${job.id} hoàn tất: ${job.returnvalue.filename}`)
);
worker.on("failed", (job, err) =>
  console.error(`Job ${job.id} thất bại: ${err.message}`)
);
