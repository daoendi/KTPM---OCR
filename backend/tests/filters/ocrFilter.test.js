/**
 * backend/tests/filters/ocrFilter.test.js
 */

import { OCRFilter } from "@filters/ocrFilter.js";
import { jest } from "@jest/globals";

jest.unstable_mockModule("@utils/redisClient.js", () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.unstable_mockModule("@utils/ocr.js", () => ({
  ocrImageToText: jest.fn(),
}));

const { redisClient } = await import("@utils/redisClient.js");
const { ocrImageToText } = await import("@utils/ocr.js");
import crypto from "crypto";

describe("OCRFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock createHash → an toàn, không destroy module crypto
    jest.spyOn(crypto, "createHash").mockReturnValue({
      update() { return this; },
      digest() { return "MOCK_HASH"; },
    });
  });

  // ==== Thiếu buffer → throw
  test("Throw khi thiếu ctx.buffer", async () => {
    await expect(OCRFilter({})).rejects.toThrow(
      "OCRFilter: thiếu ctx.buffer (ảnh đầu vào)."
    );
  });

  // ==== Cache HIT JSON hợp lệ
  test("Cache hit với JSON hợp lệ", async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        text: "Hello OCR",
        meta: { quality: "good" },
      })
    );

    const ctx = { buffer: Buffer.from("data"), lang: "eng" };
    const result = await OCRFilter(ctx);

    expect(result.text).toBe("Hello OCR");
    expect(result.ocrMeta).toEqual({ quality: "good" });
    expect(result.ocrFromCache).toBe(true);
    expect(result.textHash).toBe("MOCK_HASH");
  });

  // ==== Cache HIT JSON lỗi → fallback raw string
  test("Cache hit: JSON lỗi → fallback raw string", async () => {
    redisClient.get.mockResolvedValue("PLAIN_TEXT_OCR");

    const ctx = { buffer: Buffer.from("x") };
    const result = await OCRFilter(ctx);

    expect(result.text).toBe("PLAIN_TEXT_OCR");
    expect(result.ocrMeta).toEqual({});
    expect(result.ocrFromCache).toBe(true);
  });

  // ==== Cache miss → OCR trả string
  test("Cache miss → ocrImageToText trả string", async () => {
    redisClient.get.mockResolvedValue(null);
    ocrImageToText.mockResolvedValue("OCR_STRING_RESULT");

    const ctx = { buffer: Buffer.from("imgdata"), lang: "vie" };
    const result = await OCRFilter(ctx);

    expect(result.text).toBe("OCR_STRING_RESULT");
    expect(result.ocrFromCache).toBe(false);
    expect(result.ocrCacheFallback).toBe(false);
    expect(redisClient.set).toHaveBeenCalled();
  });

  // ==== Cache miss → OCR trả object
  test("Cache miss → ocrImageToText trả object", async () => {
    redisClient.get.mockResolvedValue(null);
    ocrImageToText.mockResolvedValue({
      text: "OBJ_TEXT",
      cacheFallback: true,
    });

    const ctx = { buffer: Buffer.from("img") };
    const result = await OCRFilter(ctx);

    expect(result.text).toBe("OBJ_TEXT");
    expect(result.ocrFromCache).toBe(true);
    expect(result.ocrCacheFallback).toBe(true);
    expect(result.ocrMeta).toEqual({ langDetected: "eng+vie" });
  });

  // ==== Redis set lỗi → không crash
  test("Redis set lỗi → không crash", async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockRejectedValue(new Error("Redis failed"));
    ocrImageToText.mockResolvedValue("TEXT");

    const ctx = { buffer: Buffer.from("img") };
    const result = await OCRFilter(ctx);

    expect(result.text).toBe("TEXT");
  });

  // ==== Có preprocessedBuffer → dùng buffer đó
  test("Có preprocessedBuffer → dùng buffer đã xử lý", async () => {
    redisClient.get.mockResolvedValue(null);

    const pre = Buffer.from("preprocessed");
    ocrImageToText.mockResolvedValue("TEXT");

    const ctx = {
      buffer: Buffer.from("raw"),
      preprocessedBuffer: pre,
    };

    const result = await OCRFilter(ctx);

    expect(ocrImageToText).toHaveBeenCalledWith(
      pre,
      "eng+vie",
      { preprocessed: true }
    );

    expect(result.textHash).toBe("MOCK_HASH");
  });
});
