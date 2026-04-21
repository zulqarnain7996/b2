SET @col_is_sticky := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'is_sticky'
);
SET @sql_is_sticky := IF(@col_is_sticky = 0, 'ALTER TABLE notices ADD COLUMN is_sticky TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_is_sticky FROM @sql_is_sticky; EXECUTE stmt_is_sticky; DEALLOCATE PREPARE stmt_is_sticky;

SET @col_show_on_login := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'show_on_login'
);
SET @sql_show_on_login := IF(@col_show_on_login = 0, 'ALTER TABLE notices ADD COLUMN show_on_login TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_show_on_login FROM @sql_show_on_login; EXECUTE stmt_show_on_login; DEALLOCATE PREPARE stmt_show_on_login;

SET @col_repeat_every_login := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'repeat_every_login'
);
SET @sql_repeat_every_login := IF(@col_repeat_every_login = 0, 'ALTER TABLE notices ADD COLUMN repeat_every_login TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_repeat_every_login FROM @sql_repeat_every_login; EXECUTE stmt_repeat_every_login; DEALLOCATE PREPARE stmt_repeat_every_login;

SET @col_is_dismissible := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'is_dismissible'
);
SET @sql_is_dismissible := IF(@col_is_dismissible = 0, 'ALTER TABLE notices ADD COLUMN is_dismissible TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_is_dismissible FROM @sql_is_dismissible; EXECUTE stmt_is_dismissible; DEALLOCATE PREPARE stmt_is_dismissible;

SET @col_requires_ack := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'requires_acknowledgement'
);
SET @sql_requires_ack := IF(@col_requires_ack = 0, 'ALTER TABLE notices ADD COLUMN requires_acknowledgement TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_requires_ack FROM @sql_requires_ack; EXECUTE stmt_requires_ack; DEALLOCATE PREPARE stmt_requires_ack;

SET @col_target_audience := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'target_audience'
);
SET @sql_target_audience := IF(@col_target_audience = 0, 'ALTER TABLE notices ADD COLUMN target_audience VARCHAR(32) NOT NULL DEFAULT ''all''', 'SELECT 1');
PREPARE stmt_target_audience FROM @sql_target_audience; EXECUTE stmt_target_audience; DEALLOCATE PREPARE stmt_target_audience;

SET @col_target_department := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'target_department'
);
SET @sql_target_department := IF(@col_target_department = 0, 'ALTER TABLE notices ADD COLUMN target_department VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt_target_department FROM @sql_target_department; EXECUTE stmt_target_department; DEALLOCATE PREPARE stmt_target_department;

SET @col_target_role := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'target_role'
);
SET @sql_target_role := IF(@col_target_role = 0, 'ALTER TABLE notices ADD COLUMN target_role VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt_target_role FROM @sql_target_role; EXECUTE stmt_target_role; DEALLOCATE PREPARE stmt_target_role;

SET @col_closed_at := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'closed_at'
);
SET @sql_closed_at := IF(@col_closed_at = 0, 'ALTER TABLE notices ADD COLUMN closed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt_closed_at FROM @sql_closed_at; EXECUTE stmt_closed_at; DEALLOCATE PREPARE stmt_closed_at;

SET @col_closed_by := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'closed_by_user_id'
);
SET @sql_closed_by := IF(@col_closed_by = 0, 'ALTER TABLE notices ADD COLUMN closed_by_user_id INT NULL', 'SELECT 1');
PREPARE stmt_closed_by FROM @sql_closed_by; EXECUTE stmt_closed_by; DEALLOCATE PREPARE stmt_closed_by;

CREATE TABLE IF NOT EXISTS notice_user_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  notice_id INT NOT NULL,
  user_id INT NOT NULL,
  seen_at DATETIME NULL,
  dismissed_at DATETIME NULL,
  acknowledged_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

SET @idx_notice_user_unique := (
  SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'notice_user_states' AND index_name = 'uq_notice_user_state'
);
SET @sql_notice_user_unique := IF(@idx_notice_user_unique = 0, 'CREATE UNIQUE INDEX uq_notice_user_state ON notice_user_states (notice_id, user_id)', 'SELECT 1');
PREPARE stmt_notice_user_unique FROM @sql_notice_user_unique; EXECUTE stmt_notice_user_unique; DEALLOCATE PREPARE stmt_notice_user_unique;
