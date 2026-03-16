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
uvicorn app.main:app --reload --port 8000
```

- API base: `http://localhost:8000/api`
- Uploads: `http://localhost:8000/uploads/<filename>`

## Endpoints

- `POST /api/employees/enroll`
- `PUT /api/employees/{id}`
- `GET /api/employees`
- `POST /api/attendance/checkin`
- `GET /api/attendance/today`
- `GET /api/attendance/history/{employeeId}`
- `GET /api/audit/logs`
- `GET /api/files/{filename}`
