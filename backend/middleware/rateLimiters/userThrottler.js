import rateLimit from 'express-rate-limit';
/**
 * Tạo bộ điều tiết lưu lượng (Throttler)
 * @param {number} limit - Số request tối đa
 * @param {number} windowSeconds - Khoảng thời gian (giây)
 */
const createUserThrottler = (limit, windowSeconds) => {
    return rateLimit({
        windowMs: windowSeconds * 1000, // Đổi sang mili giây
        max: limit, // Giới hạn số lượng request
        standardHeaders: true, // Trả về header RateLimit-Limit, RateLimit-Remaining
        legacyHeaders: false,

        // Key quan trọng: Xác định danh tính người dùng
        keyGenerator: (req, res) => {
            // Giả định verifyToken đã chạy và gán user vào req.user
            if (req.user && req.user.id) {
                return req.user.id;
            }
            return req.ip; // Fallback nếu không tìm thấy user
        },

        // Tùy chỉnh phản hồi khi bị chặn
        handler: (req, res, next, options) => {
            res.status(options.statusCode).json({
                error: "Too Many Requests",
                message: `Bạn đã vượt quá giới hạn ${limit} yêu cầu trong ${windowSeconds} giây. Vui lòng chậm lại.`,
                retryAfter: options.windowMs / 1000
            });
        }
    });
};

export default createUserThrottler;