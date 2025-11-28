// utils/redisClient.js
import { createClient } from "redis";

// Use REDIS_URL from environment if provided, otherwise default to localhost.
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
// Tạo một instance của Redis client.
const redisClient = createClient({
  url: REDIS_URL,
});

// Lắng nghe sự kiện 'connect' để thông báo khi kết nối thành công.
redisClient.on("connect", () =>
  console.log("Đã kết nối thành công đến Redis.")
);
// Lắng nghe sự kiện 'error' để bắt và ghi lại bất kỳ lỗi nào từ Redis.
redisClient.on("error", (err) => console.error("Lỗi kết nối Redis:", err));

// Thực hiện kết nối đến Redis server.
// Sử dụng `await` ở top-level, tính năng của ES modules.
await redisClient.connect();

// Xuất (export) instance của client để các module khác trong ứng dụng có thể sử dụng lại.
// Sử dụng named export để đảm bảo tính nhất quán khi import.
export { redisClient };
