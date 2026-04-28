CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  force_password_change TINYINT(1) NOT NULL DEFAULT 0,
  employee_id INT NULL,
  KEY idx_users_employee_id (employee_id),
  UNIQUE KEY uq_users_employee_id (employee_id),
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  permission_key VARCHAR(64) NOT NULL,
  allowed_departments_json TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_permission (user_id, permission_key)
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  role VARCHAR(255) NOT NULL,
  shift_start_time TIME NULL,
  grace_period_mins INT NULL DEFAULT 15,
  fine_per_minute_pkr DECIMAL(10,2) NULL DEFAULT 0,
  late_fine_pkr DECIMAL(10,2) NULL DEFAULT 0,
  absent_fine_pkr DECIMAL(10,2) NULL DEFAULT 0,
  not_marked_fine_pkr DECIMAL(10,2) NULL DEFAULT 0,
  off_days_json TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  photo_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS face_embeddings (
  id VARCHAR(64) PRIMARY KEY,
  employee_id INT NOT NULL,
  embedding LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_face_employee FOREIGN KEY (employee_id)
    REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(64) PRIMARY KEY,
  employee_id INT NOT NULL,
  date DATE NOT NULL,
  checkin_time VARCHAR(5) NULL,
  status VARCHAR(64) NOT NULL,
  fine_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  confidence FLOAT NOT NULL,
  source ENUM('face','manual') NOT NULL DEFAULT 'face',
  marked_by_user_id INT NULL,
  note VARCHAR(255) NULL,
  evidence_photo_url VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id)
    REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_attendance_marked_by_user FOREIGN KEY (marked_by_user_id)
    REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_attendance_employee_date (employee_id, date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor VARCHAR(255) NOT NULL,
  action VARCHAR(255) NOT NULL,
  details TEXT
);

CREATE TABLE IF NOT EXISTS face_capture_hashes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_hash CHAR(64) NOT NULL UNIQUE,
  employee_id INT NULL,
  context ENUM('enroll','checkin') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT PRIMARY KEY,
  shift_start_time TIME NOT NULL DEFAULT '09:00:00',
  grace_period_mins INT NOT NULL DEFAULT 15,
  fine_per_minute_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  late_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  absent_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  not_marked_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO app_settings (
  id, shift_start_time, grace_period_mins, fine_per_minute_pkr
)
VALUES (1, '09:00:00', 15, 0.00)
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO departments (name, is_active)
VALUES
  ('IT', 1),
  ('Call center', 1),
  ('Accounts', 1),
  ('School', 1),
  ('Quran', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
