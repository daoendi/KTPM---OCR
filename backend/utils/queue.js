// utils/queue.js
import { Queue, Worker, QueueEvents } from "bullmq";
import { redisClient } from "./redisClient.js";

const connection = redisClient.duplicate(); // tái sử dụng Redis
await connection.connect();

// Khởi tạo hàng đợi OCR
export const jobQueue = new Queue("ocr-jobs", { connection });

// Sự kiện theo dõi
export const jobEvents = new QueueEvents("ocr-jobs", { connection });
jobEvents.on("completed", ({ jobId }) =>
  console.log(`✅ Job ${jobId} hoàn tất`)
);
jobEvents.on("failed", ({ jobId, failedReason }) =>
  console.error(`❌ Job ${jobId} lỗi: ${failedReason}`)
);
