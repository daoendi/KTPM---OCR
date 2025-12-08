import { PreprocessFilter } from "@filters/preprocessFilter.js";
import { jest } from "@jest/globals";

// ------------------------------------------------------------
// MOCK MODULES
// ------------------------------------------------------------
jest.mock("@utils/redisClient.js", () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock("@utils/cacheStats.js", () => ({
  recordHit: jest.fn(),
  recordMiss: jest.fn(),
}));

jest.mock("@utils/ocr.js", () => ({
  preprocessImage: jest.fn(async (buf) =>
    Buffer.from("processed-" + buf.toString())
  ),
}));

jest.mock("crypto");

import { redisClient } from "@utils/redisClient.js";
import { recordHit, recordMiss } from "@utils/cacheStats.js";
import { preprocessImage } from "@utils/ocr.js";
import crypto from "crypto";

// ------------------------------------------------------------
// TEST SUITE
// ------------------------------------------------------------
describe("PreprocessFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock crypto SHA-256 hash → luôn trả "MOCK_HASH"
    crypto.createHash.mockReturnValue({
      update: () => ({
        digest: () => "MOCK_HASH",
      }),
    });
  });

  // ==========================================================
  // BASIC VALIDATION
  // ==========================================================
  test("❌ Throw lỗi nếu thiếu ctx.buffer", async () => {
    const ctx = {};
    await expect(PreprocessFilter(ctx)).rejects.toThrow(
      "ctx.buffer is required"
    );
  });

  // ==========================================================
  // CACHE MISS
  // ==========================================================
  test("✔ Cache MISS → gọi preprocessImage và lưu cache", async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue("OK");

    const ctx = { buffer: Buffer.from("dummy") };
    const result = await PreprocessFilter(ctx);

    expect(result.preprocessFromCache).toBe(false);
    expect(preprocessImage).toHaveBeenCalledWith(Buffer.from("dummy"));
    expect(result.preprocessedBuffer.toString()).toBe("processed-dummy");
    expect(redisClient.set).toHaveBeenCalledTimes(1);
    expect(recordMiss).toHaveBeenCalledWith("preprocess");
  });

  test("✔ Cache MISS → redis.set ném lỗi → không crash", async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockRejectedValue(new Error("Redis died"));

    const ctx = { buffer: Buffer.from("dummy") };
    const result = await PreprocessFilter(ctx);

    expect(result.preprocessFromCache).toBe(false);
    expect(result.preprocessedBuffer.toString()).toBe("processed-dummy");
    expect(redisClient.set).toHaveBeenCalledTimes(1);
  });

  // ==========================================================
  // CACHE HIT
  // ==========================================================
  test("✔ Cache HIT → dùng buffer cache", async () => {
    const cached = Buffer.from("processed-dummy").toString("base64");
    redisClient.get.mockResolvedValue(cached);

    const ctx = { buffer: Buffer.from("dummy") };

    const result = await PreprocessFilter(ctx);

    expect(result.preprocessFromCache).toBe(true);
    expect(result.preprocessedBuffer.toString()).toBe("processed-dummy");
    expect(redisClient.set).not.toHaveBeenCalled();
    expect(recordHit).toHaveBeenCalledWith("preprocess");
  });

  // ==========================================================
  // HASH CHECK
  // ==========================================================
  test("✔ Tạo rawImageHash bằng SHA-256 giả (MOCK_HASH)", async () => {
    redisClient.get.mockResolvedValue(null);

    const ctx = { buffer: Buffer.from("dummy") };
    await PreprocessFilter(ctx);

    expect(ctx.rawImageHash).toBe("MOCK_HASH");
  });

  test("✔ Tạo preprocessedHash bằng SHA-256 giả (MOCK_HASH)", async () => {
    redisClient.get.mockResolvedValue(null);

    const ctx = { buffer: Buffer.from("dummy") };
    await PreprocessFilter(ctx);

    expect(ctx.preprocessedHash).toBe("MOCK_HASH");
  });

  // ==========================================================
  // CACHE KEY CHECK
  // ==========================================================
  test("✔ Cache key đúng dạng ocr:pre:<rawHash>", async () => {
    redisClient.get.mockResolvedValue(null);

    const ctx = { buffer: Buffer.from("dummy") };
    await PreprocessFilter(ctx);

    expect(redisClient.get).toHaveBeenCalledWith("ocr:pre:MOCK_HASH");
  });
});
