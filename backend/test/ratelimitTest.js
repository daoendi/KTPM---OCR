import http from "k6/http";
import { check, sleep } from "k6";

// Cấu hình kịch bản test
export const options = {
  scenarios: {
    // Kịch bản 1: Spam request để kích hoạt Rate Limit
    spam_attack: {
      executor: "constant-arrival-rate",
      rate: 50, // bám theo config server: 50 req/s
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 60,
      maxVUs: 80,
    },
  },
  // Thiết lập ngưỡng (Thresholds) để xem test Pass hay Fail
  thresholds: {
    // Chúng ta KỲ VỌNG sẽ thấy lỗi 429, nên nếu 100% request thành công (200) => Rate Limit chưa hoạt động!
    http_req_duration: ["p(95)<2000"], // 95% request phải phản hồi dưới 2s (khi chưa bị chặn)
  },
};

// Đọc file ảnh để upload (giả sử bạn có file test.png cùng thư mục)
// Đảm bảo đường dẫn ảnh hợp lệ và có quyền đọc
const img = open("F:/ScreenShot/Screenshot 2025-03-18 111303.png", "b");

export default function () {
  const url = "http://localhost:3000/api/convert-async"; // API async dùng multer.single("image")

  // Server mong đợi field tên "image" theo multer.single("image")
  const payload = {
    image: http.file(img, "test.png", "image/png"),
    targetLang: "vi",
    docTitle: "RateLimitTest",
    outputFormat: "pdf",
  };

  const token = __ENV.TOKEN || ""; // truyền TOKEN qua môi trường nếu muốn test per-user
  const params = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  };

  const res = http.post(url, payload, params);

  // Kiểm tra phản hồi
  check(res, {
    "Status 200 (thành công)": (r) => r.status === 200,
    "Status 429 (rate limited)": (r) => r.status === 429,
    "Có jobId khi 200": (r) =>
      r.status === 200 ? JSON.parse(r.body || "{}").jobId !== undefined : true,
  });

  // Log ra console nếu gặp 429 để bạn dễ thấy
  if (res.status === 429) {
    console.log("Server đã chặn request: Rate Limit hoạt động tốt!");
  }
}
