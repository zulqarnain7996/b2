CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  priority ENUM('normal','important','urgent') DEFAULT 'normal',
  is_active TINYINT DEFAULT 1,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_by_user_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

SET @idx_active_dates_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'notices'
    AND index_name = 'idx_notices_active_dates'
);
SET @idx_active_dates_sql := IF(
  @idx_active_dates_exists = 0,
  'CREATE INDEX idx_notices_active_dates ON notices (is_active, starts_at, ends_at)',
  'SELECT 1'
);
PREPARE stmt_active_dates FROM @idx_active_dates_sql; EXECUTE stmt_active_dates; DEALLOCATE PREPARE stmt_active_dates;

SET @idx_created_at_exists := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'notices'
    AND index_name = 'idx_notices_created_at'
);
SET @idx_created_at_sql := IF(
  @idx_created_at_exists = 0,
  'CREATE INDEX idx_notices_created_at ON notices (created_at)',
  'SELECT 1'
);
PREPARE stmt_created_at FROM @idx_created_at_sql; EXECUTE stmt_created_at; DEALLOCATE PREPARE stmt_created_at;
