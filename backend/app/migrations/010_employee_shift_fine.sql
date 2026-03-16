-- employees.shift_start_time
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'shift_start_time'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN shift_start_time TIME NULL',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- employees.grace_period_mins
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'grace_period_mins'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN grace_period_mins INT NULL DEFAULT 15',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- employees.fine_per_minute_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'fine_per_minute_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN fine_per_minute_pkr DECIMAL(10,2) NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;