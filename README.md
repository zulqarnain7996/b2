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

- `VITE_API_BASE_URL=http://localhost:8000/api`

## Features Delivered

- Local face embeddings (InsightFace + ONNX Runtime), cosine matching in backend
- No Gemini or remote face verification calls
- Quality checks: no face, too dark, too blurry
- Double-submit lock + already-checked-in-today guard
- Face thumbnails saved and served from backend uploads
- Admin pages: employees (add/edit/re-enroll), today attendance, audit logs
- Employee pages: check-in, history
