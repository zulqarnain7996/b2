-- Ensure employee-linked rows are deleted automatically when an employee is removed.
-- face_embeddings.employee_id -> employees.id ON DELETE CASCADE
SET @has_fk := (
  SELECT COUNT(1)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'face_embeddings'
    AND constraint_name = 'fk_face_employee'
);

SET @delete_rule := (
  SELECT delete_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'face_embeddings'
    AND constraint_name = 'fk_face_employee'
  LIMIT 1
);

SET @sql := IF(
  @has_fk = 0,
  'ALTER TABLE face_embeddings ADD CONSTRAINT fk_face_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  IF(@delete_rule = 'CASCADE', 'SELECT 1', 'ALTER TABLE face_embeddings DROP FOREIGN KEY fk_face_employee')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_fk = 1 AND @delete_rule <> 'CASCADE',
  'ALTER TABLE face_embeddings ADD CONSTRAINT fk_face_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- attendance.employee_id -> employees.id ON DELETE CASCADE
SET @has_fk := (
  SELECT COUNT(1)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'attendance'
    AND constraint_name = 'fk_attendance_employee'
);

SET @delete_rule := (
  SELECT delete_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'attendance'
    AND constraint_name = 'fk_attendance_employee'
  LIMIT 1
);

SET @sql := IF(
  @has_fk = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  IF(@delete_rule = 'CASCADE', 'SELECT 1', 'ALTER TABLE attendance DROP FOREIGN KEY fk_attendance_employee')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_fk = 1 AND @delete_rule <> 'CASCADE',
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
