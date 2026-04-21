SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE attendance ADD COLUMN device_info VARCHAR(255) NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND column_name = 'device_info'
);
PREPARE s1 FROM @stmt;
EXECUTE s1;
DEALLOCATE PREPARE s1;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE attendance ADD COLUMN device_ip VARCHAR(64) NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND column_name = 'device_ip'
);
PREPARE s2 FROM @stmt;
EXECUTE s2;
DEALLOCATE PREPARE s2;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE attendance ADD COLUMN checkout_time VARCHAR(5) NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND column_name = 'checkout_time'
);
PREPARE s3 FROM @stmt;
EXECUTE s3;
DEALLOCATE PREPARE s3;

SET @stmt = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE attendance ADD COLUMN checkout_evidence_photo_url VARCHAR(500) NULL',
    'SELECT 1'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'attendance'
    AND column_name = 'checkout_evidence_photo_url'
);
PREPARE s4 FROM @stmt;
EXECUTE s4;
DEALLOCATE PREPARE s4;
