/**
 * Tests for CacheStoreFilter (ESM compatible)
 */
import { jest } from "@jest/globals";

// -----------------------------------------------
// 1. MOCK REDIS CLIENT BẰNG unstable_mockModule
// -----------------------------------------------
const mockSet = jest.fn();

jest.unstable_mockModule("@utils/redisClient.js", () => ({
  redisClient: {
    set: mockSet,
  },
}));

// -----------------------------------------------
// 2. IMPORT MODULES SAU KHI MOCK
// -----------------------------------------------
const { redisClient } = await import("@utils/redisClient.js");
const { CacheStoreFilter } = await import("@filters/cacheStoreFilter.js");

describe("CacheStoreFilter (ESM)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Lưu cache khi có ctx.cacheKey và không fromCache", async () => {
    const ctx = {
      cacheKey: "abc123",
      fromCache: false,
      text: "hello",
      translated: "xin chào",
      mime: "text/plain",
      filename: "hello.txt",
      output: Buffer.from("OUTPUTDATA"),
    };

    const result = await CacheStoreFilter(ctx);

    expect(mockSet).toHaveBeenCalledTimes(1);

    const [key, value, ex, ttl] = mockSet.mock.calls[0];

    expect(key).toBe("abc123");
    expect(ex).toBe("EX");
    expect(ttl).toBe(3600);

    const parsed = JSON.parse(value);
    expect(parsed.text).toBe("hello");
    expect(parsed.translated).toBe("xin chào");
    expect(parsed.mime).toBe("text/plain");
    expect(parsed.filename).toBe("hello.txt");
    expect(parsed.output).toBe(Buffer.from("OUTPUTDATA").toString("base64"));

    expect(result).toBe(ctx);
  });

  test("Không lưu cache nếu ctx.fromCache = true", async () => {
    const ctx = {
      cacheKey: "xyz123",
      fromCache: true,
      output: Buffer.from("DATA"),
    };

    const result = await CacheStoreFilter(ctx);

    expect(mockSet).not.toHaveBeenCalled();
    expect(result).toBe(ctx);
  });

  test("Không lưu cache nếu không có cacheKey", async () => {
    const ctx = {
      fromCache: false,
      output: Buffer.from("DATA"),
    };

    const result = await CacheStoreFilter(ctx);

    expect(mockSet).not.toHaveBeenCalled();
    expect(result).toBe(ctx);
  });

  test("Không crash nếu Redis ném lỗi", async () => {
    mockSet.mockRejectedValue(new Error("Redis failed"));

    const ctx = {
      cacheKey: "crashKey",
      fromCache: false,
      text: "A",
      translated: "B",
      mime: "text/plain",
      filename: "a.txt",
      output: Buffer.from("X"),
    };

    const result = await CacheStoreFilter(ctx);

    expect(mockSet).toHaveBeenCalled();
    expect(result).toBe(ctx);
  });
});
