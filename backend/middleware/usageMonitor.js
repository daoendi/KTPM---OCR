import User from '../models/User.js';

const usageMonitor = async(req, res, next) => {
    // Nếu request không có user (chưa đăng nhập), bỏ qua việc ghi log
    if (!req.user || !req.user.id) {
        return next();
    }

    try {
        // Cập nhật Database: Tăng apiCallCount lên 1
        // Sử dụng findByIdAndUpdate để tối ưu hiệu năng (atomic update)
        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'metrics.apiCallCount': 1 },
            $set: { 'metrics.lastActiveAt': new Date() }
        });

        // Tiếp tục xử lý request
        next();
    } catch (error) {
        console.error("Lỗi khi ghi nhận usage:", error);
        // Vẫn cho request đi tiếp để không ảnh hưởng trải nghiệm người dùng
        next();
    }
};

export default usageMonitor;