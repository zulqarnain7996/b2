SET @col_show_on_refresh := (
  SELECT COUNT(1) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'notices' AND column_name = 'show_on_refresh'
);
SET @sql_show_on_refresh := IF(@col_show_on_refresh = 0, 'ALTER TABLE notices ADD COLUMN show_on_refresh TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt_show_on_refresh FROM @sql_show_on_refresh; EXECUTE stmt_show_on_refresh; DEALLOCATE PREPARE stmt_show_on_refresh;
