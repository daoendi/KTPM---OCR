import mongoose from "mongoose";

const { Schema, model } = mongoose;

const userSchema = new Schema({
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    createdAt: { type: Date, default: Date.now },
    metrics: {
        apiCallCount: { type: Number, default: 0 }, // Tổng số lần gọi API
        lastActiveAt: { type: Date, default: Date.now } // Thời điểm gọi gần nhất
    }
});

export default model("User", userSchema);