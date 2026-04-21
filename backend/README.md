# Face Attendance Backend

## 1) Setup

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
copy .env.example .env
```

Update `.env` with your MySQL credentials:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `CORS_ORIGINS` (React dev URL)

## 2) Initialize DB

```bash
cd backend
python -m app.init_db
```

This executes `app/schema.sql` and creates all required tables.

## 3) Run API

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --reload --port 8000
```

- API base: `http://localhost:8000/api`
- Uploads: `http://localhost:8000/uploads/<filename>`

## LAN setup note

For LAN browser access with webcam support, do not call this backend directly from the browser over `http://<LAN-IP>:8000`.

Instead:

1. Run the backend on the main PC as above.
2. Run the Vite frontend on HTTPS.
3. Let Vite proxy `/api` and `/uploads` to this backend.

That keeps the browser on one HTTPS origin, which is required for camera access on other PCs without Chrome insecure-origin flags.

## Endpoints

- `POST /api/employees/enroll`
- `PUT /api/employees/{id}`
- `GET /api/employees`
- `POST /api/attendance/checkin`
- `GET /api/attendance/today`
- `GET /api/attendance/history/{employeeId}`
- `GET /api/audit/logs`
- `GET /api/files/{filename}`
