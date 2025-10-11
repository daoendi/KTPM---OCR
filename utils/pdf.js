import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export async function textToPdfBuffer(text, title = "Document") {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ✅ 1️⃣ Đăng ký font Unicode để hỗ trợ tiếng Việt
    const fontPath = path.resolve("fonts/DejaVuSans.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("DejaVu", fontPath);
      doc.font("DejaVu");
    } else {
      console.warn(
        "⚠️ Font DejaVuSans.ttf chưa được thêm vào /fonts/. PDF có thể lỗi tiếng Việt!"
      );
    }

    // ✅ 2️⃣ In tiêu đề
    doc.fontSize(18).text(title, {
      align: "center",
      underline: true,
    });
    doc.moveDown(1.5);

    // ✅ 3️⃣ Làm sạch text (OCR thường có lỗi xuống dòng / ký tự thừa)
    const cleanText = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n\n")
      .trim();

    // ✅ 4️⃣ In nội dung, chia dòng chuẩn
    doc.fontSize(13).text(cleanText, {
      width: 500,
      align: "left",
      lineGap: 4,
    });

    doc.end();
  });
}
