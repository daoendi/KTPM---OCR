// utils/queue.js
import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

function createConnection(label) {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: label,
  });
}

// Khởi tạo hàng đợi OCR với kết nối riêng
const queueConnection = createConnection("ocr-job-queue");
export const jobQueue = new Queue("ocr-jobs", { connection: queueConnection });

// Kết nối riêng cho QueueEvents để tránh block connection chính
const eventsConnection = createConnection("ocr-job-events");
export const jobEvents = new QueueEvents("ocr-jobs", {
  connection: eventsConnection,
});

jobEvents.on("completed", ({ jobId }) =>
  console.log(`✅ Job ${jobId} hoàn tất`)
);
jobEvents.on("failed", ({ jobId, failedReason }) =>
  console.error(`❌ Job ${jobId} lỗi: ${failedReason}`)
);
