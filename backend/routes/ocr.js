import express from "express";
import * as ocrController from "../controllers/ocrController.js";

/**
 * Create an OCR router. The `upload` multer instance is required so the
 * caller (server.js) can pass its configured upload middleware.
 * Usage in server.js: app.use('/api/ocr', createOcrRouter(upload));
 */
export default function createOcrRouter(upload) {
  const router = express.Router();

  // POST /api/ocr/upload (multipart: image)
  router.post(
    "/upload",
    upload.single("image"),
    ocrController.handleUploadAndOCR
  );

  // GET /api/ocr/history - list user's history
  router.get("/history", ocrController.getUserHistory);

  // GET /api/ocr/history/:id - get history detail (and read cached result from Redis)
  router.get("/history/:id", ocrController.getHistoryDetail);

  // POST /api/ocr/history/link - link a cached fileHash to current user
  router.post("/history/link", express.json(), ocrController.linkHistoryToUser);

  return router;
}
