/**
 * Tests for DocxFilter (ESM)
 */
import { jest } from "@jest/globals";

// ---------------------------------------------------------------
// 1. Mock redisClient bằng unstable_mockModule
// ---------------------------------------------------------------
const mockGet = jest.fn();
const mockSet = jest.fn();

jest.unstable_mockModule("@utils/redisClient.js", () => ({
  redisClient: {
    get: mockGet,
    set: mockSet,
  },
}));

// ---------------------------------------------------------------
// 2. Mock docx module
// ---------------------------------------------------------------
const mockDoc = { mock: true };

const mockParagraph = jest.fn((text) => ({ text }));
const mockPackerToBuffer = jest.fn(async () => Buffer.from("DOCX_DATA"));

jest.unstable_mockModule("docx", () => ({
  Document: jest.fn(() => mockDoc),
  Paragraph: mockParagraph,
  Packer: { toBuffer: mockPackerToBuffer },
}));

// ---------------------------------------------------------------
// 3. Mock crypto SHA256
// ---------------------------------------------------------------
jest.unstable_mockModule("crypto", () => ({
  default: {},
  createHash: () => ({
    update: () => ({
      update: () => ({
        digest: () => "MOCK_HASH",
      }),
    }),
  }),
}));

// ---------------------------------------------------------------
// 4. Sau khi mock xong: import module thật
// ---------------------------------------------------------------
const { redisClient } = await import("@utils/redisClient.js");
const { Document, Paragraph, Packer } = await import("docx");
const crypto = await import("crypto");
const { DocxFilter } = await import("@filters/docxFilter.js");

describe("DocxFilter (ESM)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------
  // CACHE HIT
  // --------------------------
  test("Cache hit → trả về DOCX từ Redis", async () => {
    const fakePayload = {
      fileBase64: Buffer.from("CACHED_DOCX").toString("base64"),
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "TestFile.docx",
    };

    mockGet.mockResolvedValue(JSON.stringify(fakePayload));

    const ctx = {
      text: "Hello world",
      title: "TestFile",
    };

    const result = await DocxFilter(ctx);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.output.toString()).toBe("CACHED_DOCX");
    expect(result.filename).toBe("TestFile.docx");
    expect(result.mime).toBe(fakePayload.mime);
    expect(result.exportFromCache).toBe(true);
  });

  // --------------------------
  // CACHE MISS
  // --------------------------
  test("Cache miss → tạo DOCX mới và lưu cache", async () => {
    mockGet.mockResolvedValue(null);

    const ctx = {
      text: "Line1\nLine2",
      title: "NewFile",
    };

    const result = await DocxFilter(ctx);

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(result.output.toString()).toBe("DOCX_DATA");
    expect(result.exportFromCache).toBe(false);

    // verify cache write
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, value, ex, ttl] = mockSet.mock.calls[0];

    expect(key).toBe("ocr:export:MOCK_HASH:docx");
    expect(ex).toBe("EX");
    expect(ttl).toBe(604800); // default 7 days

    const parsed = JSON.parse(value);
    expect(parsed.fileBase64).toBe(Buffer.from("DOCX_DATA").toString("base64"));
    expect(parsed.filename).toBe("NewFile.docx");
  });

  // --------------------------
  // Payload không phải JSON
  // --------------------------
  test("Cache hit với JSON sai → fallback base64 raw", async () => {
    mockGet.mockResolvedValue("INVALID_JSON");

    const ctx = { text: "abc", title: "Title" };

    const result = await DocxFilter(ctx);

    expect(result.exportFromCache).toBe(true);
    expect(result.filename).toBe("Title.docx");
    expect(result.mime).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  // --------------------------
  // Redis lỗi → không crash
  // --------------------------
  test("Redis set lỗi → không crash filter", async () => {
    mockGet.mockResolvedValue(null);
    mockSet.mockRejectedValue(new Error("Redis Failed"));

    const ctx = { text: "Hello" };

    const result = await DocxFilter(ctx);

    expect(result.output.toString()).toBe("DOCX_DATA");
  });
});
