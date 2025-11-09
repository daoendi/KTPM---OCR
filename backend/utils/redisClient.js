// utils/redisClient.js
import { createClient } from "redis";

// Tạo một instance của Redis client.
// Cấu hình URL để kết nối đến server Redis đang chạy trên localhost, cổng 6379.
const redisClient = createClient({
  url: "redis://127.0.0.1:6379",
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
