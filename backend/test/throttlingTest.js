import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<3000"], // 95% dưới 3s
    http_req_failed: ["rate<0.01"], // không quá 1% lỗi
  },
};

// Dùng upload nhỏ để đo thời gian phản hồi thực tế của endpoint async
const img = open("F:/ScreenShot/Screenshot 2025-03-17 200237.png", "b");

export default function () {
  const url = "http://localhost:3000/api/convert-async";

  const payload = {
    image: http.file(img, "throttle_test.png", "image/png"),
    targetLang: "vi",
    docTitle: "ThrottleTest",
    outputFormat: "pdf",
  };

  const token = __ENV.TOKEN || "";
  const params = {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
  };

  const res = http.post(url, payload, params);

  check(res, {
    "Status 200 (thành công)": (r) => r.status === 200,
    "Không quá 1% lỗi": (r) => r.status !== 0,
  });
}
