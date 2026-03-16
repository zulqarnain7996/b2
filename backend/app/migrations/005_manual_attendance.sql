-- attendance.checkin_time to HH:MM
ALTER TABLE attendance MODIFY COLUMN checkin_time VARCHAR(5) NOT NULL;

-- manual attendance columns
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS source ENUM('face','manual') NOT NULL DEFAULT 'face';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS marked_by_user_id INT NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS note VARCHAR(255) NULL;

-- FK attendance.marked_by_user_id -> users.id ON DELETE SET NULL
SET @has_fk := (
  SELECT COUNT(1)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'attendance'
    AND constraint_name = 'fk_attendance_marked_by_user'
);

SET @sql := IF(
  @has_fk = 0,
  'ALTER TABLE attendance ADD CONSTRAINT fk_attendance_marked_by_user FOREIGN KEY (marked_by_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
