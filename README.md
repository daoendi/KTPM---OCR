# 📖 OCR Translate PDF

Ứng dụng web hỗ trợ:

- 📄 Upload file **PDF/Word/TXT**
- 🔎 OCR trích xuất văn bản bằng **Tesseract.js**
- 🌐 Tự động phát hiện & dịch văn bản sang ngôn ngữ mong muốn
- 📥 Xuất kết quả sang **PDF, DOCX, TXT**

---

## 🚀 Yêu cầu

- [Node.js](https://nodejs.org/) >= 18 (khuyên dùng Node 20+)
- npm (có sẵn khi cài Node.js)

---

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
│ │ ├── cacheFilter.js # Kiểm tra cache trước khi chạy OCR
│ │ ├── cacheStoreFilter.js # Lưu kết quả vào cache sau khi xử lý
│ │ ├── ocrFilter.js # Nhận ảnh, chạy OCR (Tesseract)
│ │ ├── translateFilter.js # Dịch văn bản sang ngôn ngữ đích
│ │ ├── pdfFilter.js # Xuất kết quả thành file PDF
│ │ ├── docxFilter.js # Xuất kết quả thành file DOCX
│ │ └── txtFilter.js # Xuất kết quả thành file TXT
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
