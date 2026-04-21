CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO departments (name, is_active)
VALUES
  ('IT', 1),
  ('Call center', 1),
  ('Accounts', 1),
  ('School', 1),
  ('Quran', 1);

INSERT IGNORE INTO departments (name, is_active)
SELECT DISTINCT TRIM(department), 1
FROM employees
WHERE department IS NOT NULL AND TRIM(department) <> '';

INSERT IGNORE INTO departments (name, is_active)
SELECT DISTINCT TRIM(target_department), 1
FROM notices
WHERE target_department IS NOT NULL AND TRIM(target_department) <> '';
