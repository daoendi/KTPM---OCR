/**
 * Tests for CacheFilter (ESM compatible)
 */
import { jest } from "@jest/globals";

// -----------------------------------------------------
// 1. MOCK MODULES BẰNG unstable_mockModule (ESM only)
// -----------------------------------------------------
const mockGet = jest.fn();
const mockRecordHit = jest.fn();
const mockRecordMiss = jest.fn();

jest.unstable_mockModule("@utils/redisClient.js", () => ({
  redisClient: {
    get: mockGet,
  },
}));

jest.unstable_mockModule("@utils/cacheStats.js", () => ({
  recordHit: mockRecordHit,
  recordMiss: mockRecordMiss,
}));

// crypto KHÔNG CẦN mock → jest mock được core module
import crypto from "crypto";

// -----------------------------------------------------
// 2. IMPORT MODULE SAU KHI MOCK
// -----------------------------------------------------
const { redisClient } = await import("@utils/redisClient.js");
const { recordHit, recordMiss } = await import("@utils/cacheStats.js");
const { CacheFilter } = await import("@filters/cacheFilter.js");

describe("CacheFilter (ESM)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper hash function
  function hashKey(buffer, lang, format) {
    return crypto
      .createHash("sha256")
      .update(buffer)
      .update(lang)
      .update(format)
      .digest("hex");
  }

  test("Cache MISS → recordMiss() + ctx.cacheKey", async () => {
    const ctx = {
      buffer: Buffer.from("testbuffer"),
      targetLang: "en",
      outputFormat: "txt",
    };

    const expectedKey = hashKey(ctx.buffer, ctx.targetLang, ctx.outputFormat);

    mockGet.mockResolvedValue(null);

    const result = await CacheFilter(ctx);

    expect(mockGet).toHaveBeenCalledWith(expectedKey);
    expect(recordMiss).toHaveBeenCalled();
    expect(recordHit).not.toHaveBeenCalled();
    expect(result.cacheKey).toBe(expectedKey);
    expect(result.fromCache).toBeUndefined();
  });

  test("Cache HIT → recordHit() + điền ctx đầy đủ", async () => {
    const ctx = {
      buffer: Buffer.from("another-buffer"),
      targetLang: "vi",
      outputFormat: "pdf",
    };

    const expectedKey = hashKey(ctx.buffer, ctx.targetLang, ctx.outputFormat);

    const cachedData = {
      text: "hello",
      translated: "xin chào",
      mime: "application/pdf",
      filename: "test.pdf",
      output: Buffer.from("PDFDATA").toString("base64"),
    };

    mockGet.mockResolvedValue(JSON.stringify(cachedData));

    const result = await CacheFilter(ctx);

    expect(mockGet).toHaveBeenCalledWith(expectedKey);
    expect(recordHit).toHaveBeenCalled();
    expect(recordMiss).not.toHaveBeenCalled();

    expect(result.fromCache).toBe(true);
    expect(result.text).toBe("hello");
    expect(result.translated).toBe("xin chào");
    expect(result.mime).toBe("application/pdf");
    expect(result.filename).toBe("test.pdf");

    expect(result.output.equals(Buffer.from("PDFDATA"))).toBe(true);
    expect(result.cacheKey).toBeUndefined();
  });

  test("Không bao giờ gọi next(); CacheFilter chỉ return ctx", async () => {
    const ctx = {
      buffer: Buffer.from("buffer"),
      targetLang: "fr",
      outputFormat: "txt",
    };

    mockGet.mockResolvedValue(null); // MISS

    const result = await CacheFilter(ctx);

    expect(result).toBe(ctx); // return ctx chính xác
  });
});
