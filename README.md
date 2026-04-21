# Face Attendance System

## Backend (FastAPI + MySQL)

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
python -m app.init_db
uvicorn app.main:app --reload --port 8000
```

Backend `.env` keys:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `CORS_ORIGINS`
- `FACE_THRESHOLD`
- `UPLOAD_DIR`

## Frontend (React + Vite)

```bash
copy .env.example .env
npm install
npm run build
npm run dev
```

Frontend env:

- `VITE_API_BASE_URL=/api`
- `VITE_BACKEND_TARGET=http://127.0.0.1:8000`
- `VITE_DEV_HTTPS=1` to enable HTTPS dev serving
- `VITE_DEV_SSL_KEY_PATH` absolute path to your LAN-trusted dev key file
- `VITE_DEV_SSL_CERT_PATH` absolute path to your LAN-trusted dev cert file

## LAN camera-safe dev setup

For webcam access from other PCs, open the frontend over HTTPS on the Vite dev server and let Vite proxy both `/api` and `/uploads` to the backend.

Recommended flow:

1. Run the backend on the main PC over HTTP:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

2. Configure frontend `.env`:

```env
VITE_API_BASE_URL=/api
VITE_BACKEND_TARGET=http://127.0.0.1:8000
VITE_DEV_HTTPS=1
VITE_DEV_SSL_KEY_PATH=C:\path\to\localhost-lan-key.pem
VITE_DEV_SSL_CERT_PATH=C:\path\to\localhost-lan-cert.pem
```

3. Run Vite on the main PC:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

4. Open the frontend from another PC using the HTTPS Vite URL, for example:

```text
https://192.168.18.137:5173
```

Do not point the browser directly at the backend. The browser should only talk to the HTTPS Vite origin so camera APIs run in a secure context and backend calls stay same-origin via proxy.

## Features Delivered

- Local face embeddings (InsightFace + ONNX Runtime), cosine matching in backend
- No Gemini or remote face verification calls
- Quality checks: no face, too dark, too blurry
- Double-submit lock + already-checked-in-today guard
- Face thumbnails saved and served from backend uploads
- Admin pages: employees (add/edit/re-enroll), today attendance, audit logs
- Employee pages: check-in, history
