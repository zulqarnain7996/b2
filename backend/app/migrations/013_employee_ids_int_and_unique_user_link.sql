-- Normalize users.employee_id before changing type / adding uniqueness.
UPDATE users
SET employee_id = NULL
WHERE employee_id IS NOT NULL
  AND TRIM(CAST(employee_id AS CHAR)) = '';

UPDATE users
SET employee_id = NULL
WHERE employee_id IS NOT NULL
  AND TRIM(CAST(employee_id AS CHAR)) NOT REGEXP '^[0-9]+$';

-- Remove rows that cannot map to INT employee ids.
DELETE FROM face_embeddings
WHERE TRIM(CAST(employee_id AS CHAR)) NOT REGEXP '^[0-9]+$';

DELETE FROM attendance
WHERE TRIM(CAST(employee_id AS CHAR)) NOT REGEXP '^[0-9]+$';

-- Drop foreign keys if present so column type changes can succeed.
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_employee') > 0,
  'ALTER TABLE users DROP FOREIGN KEY fk_users_employee',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'face_embeddings' AND constraint_name = 'fk_face_employee') > 0,
  'ALTER TABLE face_embeddings DROP FOREIGN KEY fk_face_employee',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'attendance' AND constraint_name = 'fk_attendance_employee') > 0,
  'ALTER TABLE attendance DROP FOREIGN KEY fk_attendance_employee',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Convert employee id columns to INT.
ALTER TABLE employees MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE users MODIFY COLUMN employee_id INT NULL;
ALTER TABLE face_embeddings MODIFY COLUMN employee_id INT NOT NULL;
ALTER TABLE attendance MODIFY COLUMN employee_id INT NOT NULL;

-- Clear duplicates before adding unique constraint.
UPDATE users u1
JOIN users u2
  ON u1.employee_id = u2.employee_id
 AND u1.employee_id IS NOT NULL
 AND u1.id > u2.id
SET u1.employee_id = NULL;

-- Re-add foreign keys.
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_employee') = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'face_embeddings' AND constraint_name = 'fk_face_employee') = 0,
  'ALTER TABLE face_embeddings ADD CONSTRAINT fk_face_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.table_constraints
   WHERE table_schema = DATABASE() AND table_name = 'attendance' AND constraint_name = 'fk_attendance_employee') = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure one-to-one mapping users.employee_id -> employees.id (multiple NULLs allowed).
SET @sql := IF(
  (SELECT COUNT(1)
   FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'users'
     AND index_name = 'uq_users_employee_id') = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_employee_id (employee_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
