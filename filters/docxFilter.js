import { Document, Packer, Paragraph } from "docx";

/**
 * Filter để chuyển đổi văn bản trong context thành file DOCX.
 *
 * @param {object} ctx - Đối tượng context.
 * @property {string} [ctx.translated] - Văn bản đã dịch (ưu tiên sử dụng).
 * @property {string} [ctx.text] - Văn bản gốc.
 * @property {string} [ctx.title] - Tiêu đề của tài liệu.
 * @returns {Promise<object>} - Context được cập nhật với buffer DOCX, mime type và tên file.
 */
export async function DocxFilter(ctx) {
  // Lấy nội dung và tách thành các dòng
  const content = (ctx.translated ?? ctx.text ?? "").split(/\r?\n/);

  // Tạo một tài liệu docx mới
  const doc = new Document({
    sections: [
      {
        // Chuyển mỗi dòng thành một Paragraph trong tài liệu
        children: content.map((line) => new Paragraph(line)),
      },
    ],
  });

  // Chuyển tài liệu thành buffer
  const buffer = await Packer.toBuffer(doc);

  // Cập nhật thông tin file vào context
  ctx.output = buffer;
  ctx.mime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  ctx.filename = `${ctx.title || "Document"}.docx`;

  return ctx;
}
