import { TxtFilter } from "@filters/txtFilter.js";
import { redisClient } from "@utils/redisClient.js";
import { jest } from "@jest/globals";

describe("TxtFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------
  // 1. Cache MISS → tạo TXT và ghi cache
  // -------------------------------------------------------
  test("Cache MISS → tạo TXT và lưu cache", async () => {
    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn().mockResolvedValue("OK");

    const ctx = {
      text: "hello\n\n\nworld",
      title: "MyFile",
      textHash: "hash123"
    };

    const result = await TxtFilter(ctx);

    expect(result.exportFromCache).toBe(false);
    expect(result.mime).toBe("text/plain");
    expect(result.filename).toBe("MyFile.txt");
    expect(result.output.toString()).toBe("hello\n\nworld");
    expect(redisClient.set).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------
  // 2. Cache HIT với JSON hợp lệ
  // -------------------------------------------------------
  test("Cache HIT → không tạo file mới, đọc từ cache JSON", async () => {
    const fakeCache = JSON.stringify({
      fileBase64: Buffer.from("cached content").toString("base64"),
      mime: "text/plain",
      filename: "Cached.txt"
    });

    redisClient.get = jest.fn().mockResolvedValue(fakeCache);
    redisClient.set = jest.fn();

    const ctx = { text: "ignored", title: "MyDoc", textHash: "abc123" };

    const result = await TxtFilter(ctx);

    expect(result.exportFromCache).toBe(true);
    expect(result.mime).toBe("text/plain");
    expect(result.filename).toBe("Cached.txt");
    expect(result.output.toString()).toBe("cached content");
    expect(redisClient.set).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------
  // 3. Cache HIT JSON lỗi → fallback raw base64
  // -------------------------------------------------------
  test("Cache HIT nhưng JSON lỗi → fallback sang raw cached string", async () => {
    const rawBase64 = Buffer.from("raw-txt").toString("base64");

    redisClient.get = jest.fn().mockResolvedValue(rawBase64);
    redisClient.set = jest.fn();

    const ctx = { text: "ignored", title: "FallbackTest", textHash: "xyz" };

    const result = await TxtFilter(ctx);

    expect(result.exportFromCache).toBe(true);
    expect(result.output.toString()).toBe("raw-txt");
    expect(result.filename).toBe("FallbackTest.txt");
  });

  // -------------------------------------------------------
  // 4. Normalize content
  // -------------------------------------------------------
  test("Normalize nội dung đúng: xoá nhiều dòng trống", async () => {
    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn();

    const ctx = {
      text: "A\r\n\r\n\r\nB\rC",
      title: "Normalize",
      textHash: "nnn"
    };

    const result = await TxtFilter(ctx);

    expect(result.output.toString()).toBe("A\n\nB\nC");
  });

  // -------------------------------------------------------
  // 5. Ưu tiên translated nếu có
  // -------------------------------------------------------
  test("Use translated nếu có translated", async () => {
    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn();

    const ctx = {
      text: "original",
      translated: "translated version",
      translatedHash: "t123",
      title: "Translated"
    };

    const result = await TxtFilter(ctx);

    expect(result.output.toString()).toBe("translated version");
  });
});
