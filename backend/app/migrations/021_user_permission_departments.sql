SET @has_allowed_departments_json := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'user_permissions'
    AND column_name = 'allowed_departments_json'
);

SET @sql_allowed_departments_json := IF(
  @has_allowed_departments_json = 0,
  'ALTER TABLE user_permissions ADD COLUMN allowed_departments_json TEXT NULL AFTER permission_key',
  'SELECT 1'
);

PREPARE stmt_allowed_departments_json FROM @sql_allowed_departments_json;
EXECUTE stmt_allowed_departments_json;
DEALLOCATE PREPARE stmt_allowed_departments_json;
