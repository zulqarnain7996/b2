-- Ensure source column exists
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source ENUM('face','manual') NOT NULL DEFAULT 'face';

-- Ensure unique constraint for one record per employee per day
SET @has_unique := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND index_name = 'uq_attendance_employee_date'
    AND non_unique = 0
);

SET @sql := IF(
  @has_unique = 0,
  'ALTER TABLE attendance ADD UNIQUE KEY uq_attendance_employee_date (employee_id, date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
