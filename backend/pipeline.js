import { performance } from "perf_hooks";

/**
 * Chạy một chuỗi các hàm xử lý (filters) một cách tuần tự.
 * Mỗi filter nhận vào một đối tượng context (ctx), xử lý nó, và trả về context đã được cập nhật.
 * Context được truyền từ filter này sang filter khác.
 *
 * @param {object} ctx - Đối tượng context ban đầu, chứa dữ liệu cần xử lý.
 * @param {Array<Function>} filters - Một mảng các hàm filter để thực thi.
 * @returns {Promise<object>} - Đối tượng context cuối cùng sau khi đã qua tất cả các filter.
 */
// export async function runPipeline(ctx, filters) {
//   // Lặp qua từng filter trong mảng
//   for (const filter of filters) {
//     // Thực thi filter hiện tại và cập nhật lại context
//     ctx = await filter(ctx);
//   }
//   // Trả về context cuối cùng
//   return ctx;
// }

export async function runPipeline(ctx, filters) {
  // Bắt đầu đo thời gian thực thi toàn bộ pipeline
  const start = performance.now();

  // Lặp qua từng Filter class trong mảng filters
  for (const Filter of filters) {
    // Bắt đầu đo thời gian cho filter hiện tại
    const stepStart = performance.now();
    // Thực thi filter và cập nhật context
    ctx = await Filter(ctx);
    // Kết thúc đo thời gian và in ra console
    const stepEnd = performance.now();
    console.log(` ${Filter.name}: ${(stepEnd - stepStart).toFixed(2)} ms`);
  }

  // Kết thúc đo thời gian và in ra tổng thời gian thực thi pipeline
  const end = performance.now();
  console.log(` Tổng thời gian pipeline: ${(end - start).toFixed(2)} ms`);
  // Trả về context cuối cùng sau khi đã qua tất cả các filter (hoặc dừng giữa chừng)
  return ctx;
}
