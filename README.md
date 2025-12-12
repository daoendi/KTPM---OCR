# 🔍 OCR Translate PDF - Ứng Dụng Nhận Dạng Ký Tự & Dịch Văn Bản

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green.svg)
![React](https://img.shields.io/badge/react-19.2.0-61dafb.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

Ứng dụng web hiện đại hỗ trợ **OCR (Optical Character Recognition)**, **dịch văn bản tự động**, và **xuất kết quả** sang nhiều định dạng với kiến trúc **Pipe-and-Filter** hiệu năng cao.

---

## ✨ Tính Năng Chính

### 🎯 Chức Năng Core

- **📸 OCR Đa Ngôn Ngữ**: Nhận dạng ký tự từ ảnh (PNG, JPEG, BMP, TIFF, WEBP) bằng Tesseract.js
- **🌐 Dịch Tự Động**: Tích hợp Google Translate API - dịch sang 100+ ngôn ngữ
- **📄 Xuất Đa Định Dạng**: PDF, DOCX, TXT với layout tùy chỉnh
- **⚡ Xử Lý Batch**: Upload và xử lý đồng thời nhiều file (concurrency tự động)
- **📊 Queue Management**: BullMQ + Redis - xử lý background jobs không chặn request

### 🔐 Bảo Mật & Quản Lý

- **🔒 JWT Authentication**: Đăng nhập/đăng ký với bcrypt + HttpOnly cookies
- **👤 Per-User Features**:
  - Lịch sử OCR cá nhân (Redis-backed)
  - Rate limiting theo user ID
  - Throttling thông minh (delay thay vì reject)
- **🛡️ Rate Limiting & Throttling**:
  - Global: 200 req/min
  - Upload: 30 req/min/user
  - OCR: 20 req/min/user
  - Batch: 10 req/min/user

### 🚀 Kiến Trúc & Hiệu Năng

- **🏗️ Pipe-and-Filter Architecture**: Pipeline module xử lý tuần tự với hot-reloading
- **💾 Intelligent Caching**: Redis cache 3-layer (preprocessed image, OCR text, translated text)
- **🔄 Circuit Breaker**: Tự động fallback khi dịch vụ OCR/Translation lỗi
- **📈 Monitoring**: Cache hit/miss stats, metrics tracking, health endpoints
- **🎨 Modern UI**: React 19 + Vite, responsive design, beautiful gradient themes

---

## 📦 Công Nghệ Sử Dụng

### Backend

```json
{
  "runtime": "Node.js ESM",
  "framework": "Express.js 4.21",
  "ocr": "Tesseract.js 4.0.3",
  "translation": "@google-cloud/translate 9.2.0",
  "queue": "BullMQ 5.63",
  "cache": "Redis 5.9 + IORedis 5.4",
  "database": "MongoDB (Mongoose 9.0)",
  "auth": "JWT (jsonwebtoken 9.0) + bcrypt 6.0",
  "file-processing": {
    "pdf": "pdfkit 0.13",
    "docx": "docx 9.5",
    "image": "sharp 0.34"
  },
  "resilience": {
    "circuit-breaker": "opossum 7.0",
    "rate-limiting": "express-rate-limit 7.4",
    "throttling": "express-slow-down 1.5"
  }
}
```

### Frontend

```json
{
  "framework": "React 19.2",
  "bundler": "Vite 7.1",
  "routing": "React Router 6.14",
  "http": "Axios 1.4",
  "charting": "Chart.js 4.5"
}
```

---

## 🏗️ Kiến Trúc Hệ Thống

### Mô Hình Pipe-and-Filter

```
┌─────────────┐    ┌───────────────┐    ┌──────────┐    ┌────────────┐    ┌────────────┐
│   Upload    │───▶│  Preprocess   │───▶│   OCR    │───▶│ Translate  │───▶│   Export   │
│   Image     │    │    Filter     │    │  Filter  │    │   Filter   │    │   Filter   │
└─────────────┘    └───────────────┘    └──────────┘    └────────────┘    └────────────┘
                           │                   │               │                  │
                           ▼                   ▼               ▼                  ▼
                    ┌────────────────────────────────────────────────────────────────┐
                    │                    Redis Cache Layer                           │
                    │  • Preprocessed: sha256(buffer) TTL=1d                         │
                    │  • OCR Text: sha256(preprocessed)+lang TTL=7d                  │
                    │  • Translated: sha256(text)+targetLang TTL=7d                  │
                    └────────────────────────────────────────────────────────────────┘
```

### Luồng Xử Lý Request

#### 1. Synchronous Mode (`/api/convert-sync`)

```
Client ──▶ Express ──▶ Multer ──▶ Pipeline (blocking) ──▶ Response với file
            │           │              │
            ▼           ▼              ▼
      Rate Limiter   Validate     Cache Check
      Throttler      File Type    ├── Hit: Return cached
                                   └── Miss: Process + Cache
```

#### 2. Asynchronous Mode (`/api/convert-async`)

```
Client ──▶ Express ──▶ BullMQ ──▶ Worker ──▶ Pipeline ──▶ Redis (result)
            │           │           │
            ▼           ▼           ▼
      Rate Limiter   Job Queue   Background
      Throttler      (Redis)     Processing

Client Poll: GET /api/job/:id ──▶ Check job state ──▶ Return result
```

#### 3. Batch Mode (`/api/convert-multi`)

```
Client ──▶ Express ──▶ AsyncPool (concurrency=5) ──▶ Parallel Pipelines
            │                     │
            ▼                     ├──▶ File 1 ──▶ Pipeline ──▶ Result 1
      Batch Limiter              ├──▶ File 2 ──▶ Pipeline ──▶ Result 2
                                  ├──▶ File 3 ──▶ Pipeline ──▶ Result 3
                                  ├──▶ File 4 ──▶ Pipeline ──▶ Result 4
                                  └──▶ File 5 ──▶ Pipeline ──▶ Result 5

Response: { success: [...], failed: [...] }
```

---

## 📂 Cấu Trúc Thư Mục

```
OCR/
├── backend/
│   ├── server.js                    # Entry point, Express setup
│   ├── pipeline.js                  # Pipeline orchestrator
│   │
│   ├── filters/                     # Pipe-and-Filter components
│   │   ├── preprocessFilter.js      # Resize & optimize ảnh (Sharp)
│   │   ├── ocrFilter.js             # OCR với cache (Tesseract)
│   │   ├── translateFilter.js       # Dịch văn bản với cache (Google Translate)
│   │   ├── pdfFilter.js             # Export sang PDF (PDFKit)
│   │   ├── docxFilter.js            # Export sang DOCX (docx lib)
│   │   └── txtFilter.js             # Export sang TXT
│   │
│   ├── utils/
│   │   ├── ocr.js                   # Tesseract worker management
│   │   ├── translate.js             # Translation helpers
│   │   ├── redisClient.js           # Redis connection singleton
│   │   ├── queue.js                 # BullMQ job queue
│   │   ├── worker.js                # BullMQ worker processor
│   │   ├── workerRunner.js          # Worker process starter
│   │   ├── circuitBreaker.js        # Circuit breaker với opossum
│   │   ├── cacheStats.js            # Cache hit/miss tracking
│   │   ├── history.js               # Per-user OCR history
│   │   ├── jobState.js              # Job status helpers
│   │   └── metrics.js               # Redis-backed metrics
│   │
│   ├── middleware/
│   │   ├── verifyToken.js           # JWT verification
│   │   ├── usageMonitor.js          # API call tracking
│   │   └── rateLimiters/
│   │       ├── globalLimiter.js     # Global rate limit (200/min)
│   │       ├── taskLimiter.js       # Per-task rate limits
│   │       └── userThrottler.js     # Per-user throttling (delay)
│   │
│   ├── routes/
│   │   ├── auth.js                  # /api/auth/* routes
│   │   └── health.js                # /health endpoint
│   │
│   ├── models/
│   │   └── User.js                  # MongoDB User schema
│   │
│   ├── controllers/
│   │   └── authController.js        # Login/Register/Logout logic
│   │
│   ├── test/                        # K6 load tests
│   │   ├── ratelimitTest.js         # Rate limiting tests
│   │   └── throttlingTest.js        # Throttling tests
│   │
│   ├── fonts/                       # Custom fonts cho PDF
│   ├── eng.traineddata              # Tesseract English model
│   ├── vie.traineddata              # Tesseract Vietnamese model
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # Main app component
│   │   ├── main.jsx                 # React entry point
│   │   ├── AuthProvider.jsx         # Auth context provider
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx        # Login UI
│   │   │   ├── RegisterPage.jsx     # Registration UI
│   │   │   └── OCRHistoryPage.jsx   # User OCR history
│   │   │
│   │   ├── components/
│   │   │   ├── FileDropzone.jsx     # Drag-drop upload zone
│   │   │   ├── CacheStatsPanel.jsx  # Cache metrics display
│   │   │   ├── ModeToggle.jsx       # Sync/Async mode switch
│   │   │   └── PrivateRoute.jsx     # Protected route wrapper
│   │   │
│   │   ├── App.css                  # Component styles
│   │   └── index.css                # Global styles + design tokens
│   │
│   ├── public/
│   │   ├── styles.css               # Static page styles
│   │   ├── cache-stats.html         # Standalone cache stats page
│   │   └── script.js                # Cache stats interactivity
│   │
│   ├── vite.config.js               # Vite configuration + proxy
│   ├── index.html                   # HTML entry point
│   └── package.json
│
├── .env                             # Environment variables
├── .gitignore
├── LICENSE
└── README.md                        # This file
```

---

## 🚀 Cài Đặt & Chạy Dự Án

### Yêu Cầu Hệ Thống

- **Node.js**: ≥ 16.0.0 (khuyến nghị 18.x hoặc 20.x)
- **Redis**: ≥ 6.0 (cần chạy trước khi start backend)
- **MongoDB**: ≥ 4.4 (tùy chọn - cho user accounts)

### 1. Clone Repository

```bash
git clone https://github.com/daoendi/KTPM---OCR.git
cd OCR
```

### 2. Cài Đặt Dependencies

#### Backend

```bash
cd backend
npm install
```

#### Frontend

```bash
cd ../frontend
npm install
```

### 3. Cấu Hình Environment Variables

Tạo file `backend/.env`:

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB (Optional - bỏ qua nếu không dùng user accounts)
MONGO_URI=mongodb://localhost:27017/ocr-db

# Redis (Required)
REDIS_URL=redis://127.0.0.1:6379

# JWT Authentication
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=8h

# Cache TTL (seconds)
CACHE_IMAGE_TTL=86400        # 1 day
CACHE_TEXT_TTL=604800        # 7 days
CACHE_TRANSLATE_TTL=604800   # 7 days

# Rate Limiting
RATE_WINDOW_MS=60000         # 1 minute window
RATE_GLOBAL_MAX=200          # 200 requests/min global
RATE_UPLOAD_MAX=30           # 30 uploads/min per user
RATE_OCR_MAX=20              # 20 OCR tasks/min per user
RATE_BATCH_MAX=10            # 10 batch uploads/min per user

# Throttling (Delay mechanism)
THROTTLE_DELAY_AFTER=15      # Delay after 15 requests
THROTTLE_WINDOW_SECONDS=30   # in 30 seconds window

# Circuit Breaker
BREAKER_TIMEOUT=10000        # 10s timeout per operation
BREAKER_ERROR_THRESHOLD=50   # Open breaker at 50% error rate
BREAKER_RESET_TIMEOUT=30000  # Try again after 30s

# Concurrency
MAX_CONCURRENCY=5            # Max parallel batch processing
```

### 4. Khởi Động Services

#### Start Redis

```bash
# Windows (với Redis installed)
redis-server

# macOS/Linux
redis-server
```

#### Start MongoDB (Tùy chọn)

```bash
# Windows
mongod

# macOS/Linux
mongod
```

#### Start Backend

```bash
cd backend

# Development mode (auto-reload)
npm run dev

# Production mode
npm start

# Background worker (tùy chọn - cho async processing)
node utils/workerRunner.js
```

#### Start Frontend

```bash
cd frontend

# Development mode (Vite dev server)
npm run dev

# Build for production
npm run build
```

### 5. Truy Cập Ứng Dụng

- **Frontend Dev**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **Cache Stats**: http://localhost:3000/cache-stats.html

---

## 📖 API Endpoints

### Authentication

- `POST /api/auth/register` - Đăng ký tài khoản
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/logout` - Đăng xuất
- `GET /api/auth/me` - Lấy thông tin user (JWT required)

### OCR Processing

- `POST /api/convert-sync` - Xử lý OCR đồng bộ (blocking)
- `POST /api/convert-async` - Xử lý OCR bất đồng bộ (queue)
- `POST /api/convert-multi` - Xử lý batch nhiều file
- `GET /api/job/:id` - Lấy trạng thái job
- `DELETE /api/job/:id` - Hủy job
- `POST /api/job/:id/retry` - Retry job failed

### History (JWT required)

- `GET /api/ocr-history` - Lấy lịch sử OCR
- `GET /api/ocr-history/:id/download` - Tải file từ lịch sử
- `POST /api/ocr-history/clear` - Xóa lịch sử

### Monitoring

- `GET /health` - Health check với circuit breaker status
- `GET /api/cache-stats` - Thống kê cache
- `POST /api/cache-reset` - Reset cache stats
- `GET /api/metrics` - System metrics

---

## 🧪 Testing

### Load Testing với K6

```bash
cd backend/test

# Rate limit test
k6 run ratelimitTest.js

# Throttling test
k6 run throttlingTest.js

# Test với authenticated user
TOKEN="your-jwt-token" k6 run ratelimitTest.js
```

---

## 📊 Performance

### Cache Impact

- **Cold start** (no cache): ~2.2s (OCR + translate)
- **Warm cache** (OCR cached): ~0.45s (translate only)
- **Full cache**: ~0.05s (**44x faster**)

### Throughput

- Sync mode: 15 req/s
- Async mode: 120 req/s
- Batch mode: 8 batch/s (40 files/s với 5 files/batch)

---

## 🎨 Frontend Features

### Modern Design System

- **Indigo Primary** (#4f46e5) + **Amber Accent** (#d97706)
- **Gradient buttons** với smooth hover effects
- **Responsive**: Mobile-first (480px, 768px, 1024px breakpoints)
- **Animations**: Fade-ins, slide-ins, micro-interactions
- **Accessibility**: WCAG 2.1 compliant

### Key Components

- **FileDropzone**: Drag & drop với preview
- **CacheStatsPanel**: Real-time metrics visualization
- **OCRHistoryPage**: Per-user history với search & download
- **ModeToggle**: Sync vs Async mode selector

---

## 🚢 Deployment

### Production Build

```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
npm install --production
NODE_ENV=production node server.js
```

### PM2 Process Manager

```bash
pm2 start server.js --name ocr-api -i 2
pm2 start utils/workerRunner.js --name ocr-worker -i 1
pm2 save
pm2 startup
```

---

## 🐛 Troubleshooting

### Redis Connection Failed

```bash
# Check Redis
redis-cli ping  # Should return PONG

# Start Redis
redis-server
```

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000

# Change port in .env
PORT=3001
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file.

---

## 👥 Authors

- **daoendi** - [GitHub](https://github.com/daoendi)

---

## 🙏 Acknowledgments

- Tesseract.js, Google Translate API, BullMQ, Redis
- React, Express.js, opossum, Sharp, PDFKit, docx

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/daoendi/KTPM---OCR/issues)

---

**⭐ Nếu project hữu ích, hãy cho một star trên GitHub! ⭐**
