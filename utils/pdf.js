import PDFDocument from "pdfkit";

export async function textToPdfBuffer(text, title = "Document") {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on("data", chunks.push.bind(chunks));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(title, { align: "center" }).moveDown();
    doc.fontSize(12).text(text, { align: "left" });

    doc.end();
  });
}
