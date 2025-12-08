/**
 * backend/tests/filters/pdfFilter.test.js
 */

import { PdfFilter } from "@filters/pdfFilter.js";
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

jest.mock("@utils/pdf.js", () => ({
  textToPdfBuffer: jest.fn(),
}));

jest.mock("crypto");

import { redisClient } from "@utils/redisClient.js";
import { textToPdfBuffer } from "@utils/pdf.js";
import crypto from "crypto";

// ------------------------------------------------------------
// TEST SUITE
// ------------------------------------------------------------
describe("PdfFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock crypto → trả về "MOCK_HASH"
    crypto.createHash.mockReturnValue({
      update: () => ({
        digest: () => "MOCK_HASH",
      }),
    });
  });

  // ============================================================
  // 1. CACHE HIT
  // ============================================================

  test("✔ Cache HIT — JSON hợp lệ", async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({
        fileBase64: Buffer.from("PDFDATA").toString("base64"),
        mime: "application/pdf",
        filename: "Doc.pdf",
      })
    );

    const ctx = { text: "abc", title: "Doc" };
    const result = await PdfFilter(ctx);

    expect(redisClient.get).toHaveBeenCalledTimes(1);
    expect(result.output).toEqual(Buffer.from("PDFDATA"));
    expect(result.exportFromCache).toBe(true);
    expect(result.filename).toBe("Doc.pdf");
  });

  test("✔ Cache HIT — JSON hỏng → fallback chuỗi", async () => {
    redisClient.get.mockResolvedValue(
      Buffer.from("RAWPDF").toString("base64")
    );

    const ctx = { text: "abc" };
    const result = await PdfFilter(ctx);

    expect(result.output).toEqual(Buffer.from("RAWPDF", "base64"));
    expect(result.mime).toBe("application/pdf");
    expect(result.filename).toBe("Document.pdf");
    expect(result.exportFromCache).toBe(true);
  });

  // ============================================================
  // 2. CACHE MISS
  // ============================================================

  test("✔ Cache MISS — tạo PDF mới và lưu cache", async () => {
    redisClient.get.mockResolvedValue(null);

    const fakeBuf = Buffer.from("NEWPDF");
    textToPdfBuffer.mockResolvedValue(fakeBuf);

    const ctx = { text: "hello", title: "MyPDF" };

    const result = await PdfFilter(ctx);

    expect(textToPdfBuffer).toHaveBeenCalledWith("hello", "MyPDF");
    expect(result.output).toBe(fakeBuf);
    expect(result.exportFromCache).toBe(false);
    expect(redisClient.set).toHaveBeenCalled();
  });

  test("✔ Cache MISS — redis.set ném lỗi → không crash", async () => {
    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockRejectedValue(new Error("Redis died"));

    const buf = Buffer.from("PDF");
    textToPdfBuffer.mockResolvedValue(buf);

    const ctx = { text: "abc" };
    const result = await PdfFilter(ctx);

    expect(result.output).toBe(buf);
    expect(redisClient.set).toHaveBeenCalled();
  });

  // ============================================================
  // 3. NORMALIZE NỘI DUNG
  // ============================================================

  test("✔ Normalize nội dung (CRLF → LF, trim, xoá dòng trống thừa)", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = {
      text: "Line1\r\nLine2\r\r\n\nLine3\n\n\n",
      title: "Doc",
    };

    await PdfFilter(ctx);

    expect(textToPdfBuffer).toHaveBeenCalledWith(
      "Line1\nLine2\n\nLine3",
      "Doc"
    );
  });

  test("✔ Normalize nâng cao — xoá space + newline thừa", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = { text: "  A   \n\n   \n   B  ", title: "Doc" };

    await PdfFilter(ctx);

    expect(textToPdfBuffer).toHaveBeenCalledWith("A\nB", "Doc");
  });

  // ============================================================
  // 4. HASH PRIORITY
  // ============================================================

  test("✔ Ưu tiên translatedHash", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = { translated: "abc", translatedHash: "HASH_TRANS" };
    await PdfFilter(ctx);

    expect(redisClient.get).toHaveBeenCalledWith("ocr:export:HASH_TRANS:pdf");
  });

  test("✔ Không có translatedHash → dùng textHash", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = { text: "hello", textHash: "HASH_TEXT" };
    await PdfFilter(ctx);

    expect(redisClient.get).toHaveBeenCalledWith("ocr:export:HASH_TEXT:pdf");
  });

  test("✔ Không có textHash → hash content (crypto)", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = { text: "abc" };
    await PdfFilter(ctx);

    expect(redisClient.get).toHaveBeenCalledWith("ocr:export:MOCK_HASH:pdf");
  });

  // ============================================================
  // 5. FILENAME FALLBACK
  // ============================================================

  test("✔ Không có title → fallback filename = Document.pdf", async () => {
    redisClient.get.mockResolvedValue(null);
    textToPdfBuffer.mockResolvedValue(Buffer.from("PDF"));

    const ctx = { text: "Hello" };
    const result = await PdfFilter(ctx);

    expect(result.filename).toBe("Document.pdf");
  });
});
