/**
 * Filter để chuyển đổi văn bản trong context thành file TXT.
 *
 * @param {object} ctx - Đối tượng context.
 * @property {string} [ctx.translated] - Văn bản đã dịch (ưu tiên sử dụng).
 * @property {string} [ctx.text] - Văn bản gốc.
 * @property {string} [ctx.title] - Tiêu đề của tài liệu.
 * @returns {Promise<object>} - Context được cập nhật với buffer TXT, mime type và tên file.
 */
export async function TxtFilter(ctx) {
  // Lấy nội dung: ưu tiên văn bản đã dịch, nếu không có thì dùng văn bản gốc
  const content = ctx.translated ?? ctx.text ?? "";

  // Chuyển nội dung thành buffer UTF-8
  ctx.output = Buffer.from(content, "utf-8");

  // Cập nhật thông tin file vào context
  ctx.mime = "text/plain";
  ctx.filename = `${ctx.title || "Document"}.txt`;

  return ctx;
}
