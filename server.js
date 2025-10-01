import express from "express";
import multer from "multer";
import { LRUCache } from "lru-cache"; // ✅ sửa import
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { ocrImageToText } from "./utils/ocr.js";
import { translateText } from "./utils/translate.js";
import { textToPdfBuffer } from "./utils/pdf.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ dùng LRUCache
const cache = new LRUCache({ max: 200, ttl: 1000 * 60 * 60 });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexHtml = fs.readFileSync(
  path.join(__dirname, "public", "index.html"),
  "utf-8"
);
const scriptJs = fs.readFileSync(
  path.join(__dirname, "public", "script.js"),
  "utf-8"
);

app.get("/", (req, res) => {
  res.send(indexHtml);
});

app.get("/script.js", (req, res) => {
  res.type("application/javascript").send(scriptJs);
});

app.post("/api/convert", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file ảnh" });

    const {
      ocrLang = "eng",
      targetLang = "vi",
      docTitle = "Converted",
    } = req.body;
    const key = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    if (cache.has(key)) {
      res.setHeader("Content-Type", "application/pdf");
      return res.send(cache.get(key));
    }

    const text = await ocrImageToText(req.file.buffer, ocrLang);
    const translated = await translateText(text, targetLang);
    const pdfBuffer = await textToPdfBuffer(translated, docTitle);

    cache.set(key, pdfBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${docTitle}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Server chạy tại http://localhost:3000"));
