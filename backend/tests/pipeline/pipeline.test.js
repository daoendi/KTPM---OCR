// pipeline.test.js (ESM + Jest)
import { jest } from "@jest/globals";

// =====================
// MOCK FILTERS
// =====================
jest.unstable_mockModule("../../filters/preprocessFilter.js", () => ({
  PreprocessFilter: jest.fn(async (ctx) => {
    ctx.preprocessed = true;
    return ctx;
  }),
}));

jest.unstable_mockModule("../../filters/ocrFilter.js", () => ({
  OCRFilter: jest.fn(async (ctx) => {
    ctx.ocr = "OCR_RESULT";
    return ctx;
  }),
}));

jest.unstable_mockModule("../../filters/translateFilter.js", () => ({
  TranslateFilter: jest.fn(async (ctx) => {
    ctx.translated = "TRANSLATED_TEXT";
    return ctx;
  }),
}));

jest.unstable_mockModule("../../filters/txtFilter.js", () => ({
  TxtFilter: jest.fn(async (ctx) => {
    ctx.output = Buffer.from("TEST_TXT");
    ctx.mime = "text/plain";
    ctx.filename = "output.txt";
    return ctx;
  }),
}));

// Silence logs
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

// Import thực sau khi mock xong
const { runPipeline } = await import("../../pipeline.js");
const { PreprocessFilter } = await import("../../filters/preprocessFilter.js");
const { OCRFilter } = await import("../../filters/ocrFilter.js");
const { TranslateFilter } = await import("../../filters/translateFilter.js");
const { TxtFilter } = await import("../../filters/txtFilter.js");

// =====================
// TESTS
// =====================
describe("Pipeline - end-to-end test", () => {

  test("Pipeline chạy đúng thứ tự filter", async () => {
    const input = { text: "Hello", filename: "test.png" };

    const result = await runPipeline(input);

    // Dữ liệu cuối
    expect(result.output).toBeInstanceOf(Buffer);
    expect(result.mime).toBe("text/plain");
    expect(result.filename).toBe("output.txt");

    // Các trường mock
    expect(result.preprocessed).toBe(true);
    expect(result.ocr).toBe("OCR_RESULT");
    expect(result.translated).toBe("TRANSLATED_TEXT");

    // Kiểm tra số lần gọi
    expect(PreprocessFilter).toHaveBeenCalledTimes(1);
    expect(OCRFilter).toHaveBeenCalledTimes(1);
    expect(TranslateFilter).toHaveBeenCalledTimes(1);
    expect(TxtFilter).toHaveBeenCalledTimes(1);
  });

  test("Pipeline ném lỗi khi filter thất bại", async () => {
    TranslateFilter.mockImplementationOnce(() => {
      throw new Error("Translate failed");
    });

    await expect(runPipeline({ text: "Error" }))
      .rejects
      .toThrow("Translate failed");
  });

  test("Pipeline truyền đúng ctx qua các filter", async () => {
    const result = await runPipeline({ text: "CTX_TEST" });

    expect(result.text).toBe("CTX_TEST");
    expect(result.translated).toBe("TRANSLATED_TEXT");
    expect(result.output).toBeInstanceOf(Buffer);
  });

});
