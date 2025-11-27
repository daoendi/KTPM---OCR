# 📖 OCR Translate PDF

Ứng dụng web hỗ trợ:

- 📄 Upload file **PDF/Word/TXT**
- 🔎 OCR trích xuất văn bản bằng **Tesseract.js**
- 🌐 Tự động phát hiện & dịch văn bản sang ngôn ngữ mong muốn
- 📥 Xuất kết quả sang **PDF, DOCX, TXT**

---

## 🚀 Yêu cầu

## ⚙️ Cài đặt thủ công

1. **Clone project**
   ```bash
   git clone https://github.com/<your-org>/<your-repo>.git
   cd <your-repo>
   ```
2. **Cài dependencies**
   Sau khi clone project, chạy lệnh sau để cài đặt toàn bộ thư viện cần thiết:
   npm install
   Chạy project
   npm start
   Server sẽ chạy tại: http://localhost:3000

OCR
├── backend/
│ ├── filters/ # Các Filter trong mô hình Pipe-and-Filter
│ │ ├── preprocessFilter.js # Tiền xử lý + cache ảnh
│ │ ├── ocrFilter.js # Nhận ảnh, cache text OCR
│ │ ├── translateFilter.js # Cache bản dịch theo targetLang
│ │ ├── pdfFilter.js # Cache file PDF theo hash nội dung
│ │ ├── docxFilter.js # Cache file DOCX theo hash nội dung
│ │ └── txtFilter.js # Cache file TXT theo hash nội dung
│ │
│ ├── utils/ # Các module tiện ích (Helper utilities)
│ │ ├── ocr.js # Hàm xử lý OCR dùng Tesseract
│ │ ├── pdf.js # Hỗ trợ tạo PDF (Reportlab/PDFKit)
│ │ ├── redisClient.js # Kết nối và thao tác Redis Cache
│ │ └── translate.js # Gọi API dịch (Google, LibreTranslate,…)
│ │
│ ├── fonts/ # Font
│ │
│ ├── pipeline.js # Kết nối các Filter → xử lý tuần tự (Pipe & Filter)
│ ├── server.js # Khởi chạy Express server, định tuyến API
│ ├── eng.traineddata # Ngôn ngữ OCR: English
│ ├── vie.traineddata # Ngôn ngữ OCR: Vietnamese
│ ├── package.json # Cấu hình Node.js + dependencies
│ └── package-lock.json
│
└── frontend/ # 💻 Giao diện người dùng (React / Vite app)

---

## 🔀 Sync vs Async pipeline

- `POST /api/convert-sync` → chạy pipeline ngay trong request/response, trả file trực tiếp. Đường đi này blocking nên phù hợp demo, file nhỏ hoặc kiểm thử nhanh.
- `POST /api/convert-async` → đưa payload vào Message Queue (`ocr-task`), worker nền chạy pipeline và ghi kết quả vào cache/history. Client truy vấn `/api/job/:id` để biết trạng thái hoặc tải về sau khi hoàn tất. Đường đi này chịu tải tốt hơn và nên dùng cho production hoặc file lớn.

> Cả hai đường dẫn đều dùng chung `runPipeline`, nhưng async path tách rời web thread nên không bị nghẽn khi số lượng job tăng đột biến.

---

## 🧠 4 tầng cache

1. **Ảnh preprocess** – `ocr:pre:{hashRawImage}` lưu buffer đã qua resize/grayscale/deskew ở dạng base64. Tái sử dụng cho cùng một ảnh nhưng nhiều yêu cầu khác nhau, giảm tải bộ xử lý ảnh.
2. **Text OCR** – `ocr:text:{hashPreImage}:{lang}` chứa JSON `{ text, meta }`. Một ảnh chỉ cần OCR một lần, kể cả khi dịch sang nhiều ngôn ngữ.
3. **Dịch thuật** – `ocr:trans:{hashText}:{targetLang}` giữ `{ translatedText }`. Cùng văn bản nguồn nhưng dịch sang targetLang đã từng xuất hiện sẽ bỏ qua bước gọi API dịch.
4. **Xuất file** – `ocr:export:{hashText}:{outputFormat}` lưu `{ filename, mime, fileBase64 }` cho PDF/DOCX/TXT. Xuất nhanh dù client yêu cầu tải lại nhiều lần.

Các TTL có thể tinh chỉnh qua biến môi trường `CACHE_PRE_TTL`, `CACHE_TEXT_TTL`, `CACHE_TRANSLATE_TTL`, `CACHE_EXPORT_TTL` (mặc định lần lượt 24h, 7 ngày, 7 ngày, 7 ngày).
