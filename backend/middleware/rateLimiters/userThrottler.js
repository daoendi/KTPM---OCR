import slowDown from "express-slow-down";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../../utils/redisClient.js";

/**
 * Tạo bộ điều tiết lưu lượng (Pure Throttler)
 * @param {number} delayAfter - Cho phép bao nhiêu request đầu tiên đi nhanh?
 * @param {number} windowSeconds - Khoảng thời gian tính toán
 */
const createUserThrottler = (delayAfter, windowSeconds) => {
  return slowDown({
    windowMs: windowSeconds * 1000,

    // Thay vì 'max' (chặn), ta dùng 'delayAfter'
    // Nghĩa là: "Trong vòng X giây, Y request đầu tiên sẽ chạy bình thường"
    delayAfter: delayAfter,

    // Các request thứ Y+1 trở đi sẽ bị delay (làm chậm lại)
    // delayMs: Thời gian delay tăng dần hoặc cố định
    // Ví dụ này: Request lố thứ 1 chậm 500ms, thứ 2 chậm 1000ms...
    delayMs: (hits) => hits * 500,

    // Hoặc delay cố định (ví dụ cứ lố là chậm 1 giây):
    // delayMs: 1000,

    // Giới hạn delay tối đa (để user không phải đợi cả ngày)
    maxDelayMs: 20000, // Tối đa chậm 20 giây

    // Vẫn dùng Redis để đếm số lần request (quan trọng)
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),

    // Vẫn cần định danh User
    keyGenerator: (req, res) => {
      // Ưu tiên khóa theo người dùng nếu đã xác thực
      if (req.user && (req.user.sub || req.user.id))
        return req.user.sub || req.user.id;
      // Nếu chưa đăng nhập, fallback theo IP
      return req.ip;
    },

    // LƯU Ý: Không cần hàm 'handler' trả lỗi nữa,
    // vì Throttling không trả lỗi, nó chỉ bắt user đợi.
  });
};

export default createUserThrottler;
