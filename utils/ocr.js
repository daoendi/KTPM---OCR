import Tesseract from "tesseract.js";

export async function ocrImageToText(buffer, lang = "eng") {
  const {
    data: { text },
  } = await Tesseract.recognize(buffer, lang, {
    logger: (m) => console.log(m), // log progress
  });
  return text;
}
