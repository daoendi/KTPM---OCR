/**
 * Chạy một chuỗi các hàm xử lý (filters) một cách tuần tự.
 * Mỗi filter nhận vào một đối tượng context (ctx), xử lý nó, và trả về context đã được cập nhật.
 * Context được truyền từ filter này sang filter khác.
 *
 * @param {object} ctx - Đối tượng context ban đầu, chứa dữ liệu cần xử lý.
 * @param {Array<Function>} filters - Một mảng các hàm filter để thực thi.
 * @returns {Promise<object>} - Đối tượng context cuối cùng sau khi đã qua tất cả các filter.
 */
export async function runPipeline(ctx, filters) {
  // Lặp qua từng filter trong mảng
  for (const filter of filters) {
    // Thực thi filter hiện tại và cập nhật lại context
    ctx = await filter(ctx);
  }
  // Trả về context cuối cùng
  return ctx;
}
