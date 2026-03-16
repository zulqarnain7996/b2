-- employees(created_at)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'employees'
     AND index_name = 'idx_employees_created_at') = 0,
  'CREATE INDEX idx_employees_created_at ON employees(created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- employees(department, role)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'employees'
     AND index_name = 'idx_employees_department_role') = 0,
  'CREATE INDEX idx_employees_department_role ON employees(department, role)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- attendance(date, created_at)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'attendance'
     AND index_name = 'idx_attendance_date_created') = 0,
  'CREATE INDEX idx_attendance_date_created ON attendance(date, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- attendance(employee_id, created_at)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'attendance'
     AND index_name = 'idx_attendance_employee_created') = 0,
  'CREATE INDEX idx_attendance_employee_created ON attendance(employee_id, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- audit_logs(ts)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'audit_logs'
     AND index_name = 'idx_audit_logs_ts') = 0,
  'CREATE INDEX idx_audit_logs_ts ON audit_logs(ts)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- audit_logs(actor, action)
SET @sql := IF(
  (SELECT COUNT(1) FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'audit_logs'
     AND index_name = 'idx_audit_logs_actor_action') = 0,
  'CREATE INDEX idx_audit_logs_actor_action ON audit_logs(actor, action)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
