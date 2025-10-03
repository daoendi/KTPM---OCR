import { textToPdfBuffer } from "../utils/pdf.js";

/**
 * Filter để chuyển đổi văn bản trong context thành file PDF.
 *
 * @param {object} ctx - Đối tượng context.
 * @property {string} [ctx.translated] - Văn bản đã dịch (ưu tiên sử dụng).
 * @property {string} [ctx.text] - Văn bản gốc.
 * @property {string} [ctx.title] - Tiêu đề của tài liệu.
 * @returns {Promise<object>} - Context được cập nhật với buffer PDF, mime type và tên file.
 */
export async function PdfFilter(ctx) {
  // Lấy nội dung: ưu tiên văn bản đã dịch, nếu không có thì dùng văn bản gốc
  const content = ctx.translated ?? ctx.text ?? "";

  // Tạo buffer PDF từ nội dung
  ctx.output = await textToPdfBuffer(content, ctx.title || "Document");

  // Cập nhật thông tin file vào context
  ctx.mime = "application/pdf";
  ctx.filename = `${ctx.title || "Document"}.pdf`;

  return ctx;
}
