import { TranslateFilter } from "@filters/translateFilter.js";
import { redisClient } from "@utils/redisClient.js";
import { jest } from "@jest/globals";

// Mock translateText để không gọi API thật
jest.mock("@utils/translate.js", () => ({
  translateText: jest.fn(async (text, lang) => `translated-${text}-${lang}`)
}));

describe("TranslateFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------
  // 1. Không nhập đủ text / targetLang
  // -----------------------------------------
  test("Không có text hoặc targetLang → không dịch, gán translated = text", async () => {
    const ctx = { text: "hello world" };

    const result = await TranslateFilter(ctx);

    expect(result.translated).toBe("hello world");
    expect(result.translatedHash).toBeDefined();
  });

  // -----------------------------------------
  // 2. Cache MISS
  // -----------------------------------------
  test("Cache MISS → gọi translateText() và ghi cache", async () => {
    const ctx = { text: "xin chao", targetLang: "en" };

    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn().mockResolvedValue("OK");

    const { translateText } = await import("@utils/translate.js");

    const result = await TranslateFilter(ctx);

    expect(result.translateFromCache).toBe(false);
    expect(result.translated).toBe("translated-xin chao-en");
    expect(translateText).toHaveBeenCalledTimes(1);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------
  // 3. Cache HIT
  // -----------------------------------------
  test("Cache HIT → không gọi translateText(), dùng cache", async () => {
    redisClient.get = jest.fn().mockResolvedValue(
      JSON.stringify({ translatedText: "hello-from-cache" })
    );
    redisClient.set = jest.fn();

    const ctx = { text: "xin chao", targetLang: "en" };

    const { translateText } = await import("@utils/translate.js");

    const result = await TranslateFilter(ctx);

    expect(result.translateFromCache).toBe(true);
    expect(result.translated).toBe("hello-from-cache");
    expect(translateText).not.toHaveBeenCalled();
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  // -----------------------------------------
  // 4. Cache HIT nhưng JSON hỏng → fallback raw string
  // -----------------------------------------
  test("Cache HIT nhưng JSON lỗi → fallback sang raw cached value", async () => {
    redisClient.get = jest.fn().mockResolvedValue("raw-string-value");
    redisClient.set = jest.fn();

    const ctx = { text: "xin chao", targetLang: "en" };

    const result = await TranslateFilter(ctx);

    expect(result.translateFromCache).toBe(true);
    expect(result.translated).toBe("raw-string-value");
  });

  // -----------------------------------------
  // 5. translateText() ném lỗi → fallback text gốc
  // -----------------------------------------
  test("translateText ném lỗi → fallback: translated = text gốc", async () => {
    const { translateText } = await import("@utils/translate.js");

    translateText.mockRejectedValueOnce(new Error("Fake error"));

    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn();

    const ctx = { text: "bonjour", targetLang: "vi" };

    const result = await TranslateFilter(ctx);

    expect(result.translated).toBe("bonjour");
    expect(result.translateFromCache).toBe(false);
  });

  // -----------------------------------------
  // 6. translateText trả về object có cacheFallback
  // -----------------------------------------
  test("translateText trả về object có cacheFallback → vẫn lưu cache", async () => {
    const { translateText } = await import("@utils/translate.js");

    translateText.mockResolvedValueOnce({
      translatedText: "cached-fallback-text",
      cacheFallback: true
    });

    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn().mockResolvedValue("OK");

    const ctx = { text: "hola", targetLang: "vi" };

    const result = await TranslateFilter(ctx);

    expect(result.translated).toBe("cached-fallback-text");
    expect(result.translateCacheFallback).toBe(true);
    expect(redisClient.set).toHaveBeenCalledTimes(1);
  });
});
