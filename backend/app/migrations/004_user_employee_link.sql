-- users.employee_id column
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id VARCHAR(64) NULL;

-- users(employee_id) index
SET @sql := IF(
  (SELECT COUNT(1)
   FROM information_schema.statistics
   WHERE table_schema = DATABASE()
     AND table_name = 'users'
     AND index_name = 'idx_users_employee_id') = 0,
  'CREATE INDEX idx_users_employee_id ON users(employee_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK users.employee_id -> employees.id ON DELETE SET NULL
SET @has_fk := (
  SELECT COUNT(1)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'users'
    AND constraint_name = 'fk_users_employee'
);

SET @delete_rule := (
  SELECT delete_rule
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'users'
    AND constraint_name = 'fk_users_employee'
  LIMIT 1
);

SET @sql := IF(
  @has_fk = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL',
  IF(@delete_rule = 'SET NULL', 'SELECT 1', 'ALTER TABLE users DROP FOREIGN KEY fk_users_employee')
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_fk = 1 AND @delete_rule <> 'SET NULL',
  'ALTER TABLE users ADD CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
