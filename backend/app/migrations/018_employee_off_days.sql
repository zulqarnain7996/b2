-- employees.off_days_json
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'off_days_json'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN off_days_json TEXT NULL',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
