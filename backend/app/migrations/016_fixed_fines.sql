-- employees.late_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'late_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN late_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- employees.absent_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'absent_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN absent_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- employees.not_marked_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'not_marked_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE employees ADD COLUMN not_marked_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE employees
SET
  late_fine_pkr = COALESCE(NULLIF(late_fine_pkr, 0.00), fine_per_minute_pkr, 0.00),
  absent_fine_pkr = COALESCE(absent_fine_pkr, 0.00),
  not_marked_fine_pkr = COALESCE(not_marked_fine_pkr, 0.00);

-- app_settings.late_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_settings'
    AND column_name = 'late_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE app_settings ADD COLUMN late_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- app_settings.absent_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_settings'
    AND column_name = 'absent_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE app_settings ADD COLUMN absent_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- app_settings.not_marked_fine_pkr
SET @c := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_settings'
    AND column_name = 'not_marked_fine_pkr'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE app_settings ADD COLUMN not_marked_fine_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00',
  'SELECT 1'
);
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE app_settings
SET
  late_fine_pkr = COALESCE(NULLIF(late_fine_pkr, 0.00), fine_per_minute_pkr, 0.00),
  absent_fine_pkr = COALESCE(absent_fine_pkr, 0.00),
  not_marked_fine_pkr = COALESCE(not_marked_fine_pkr, 0.00)
WHERE id = 1;
