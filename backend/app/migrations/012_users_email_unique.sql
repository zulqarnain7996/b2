-- Keep one user per email (case-insensitive), keep the lowest id row.
DELETE u1
FROM users u1
JOIN users u2
  ON LOWER(TRIM(u1.email)) = LOWER(TRIM(u2.email))
 AND u1.id > u2.id;

-- Normalize current data shape before adding unique key.
UPDATE users
SET email = TRIM(email)
WHERE email <> TRIM(email);

-- Add unique index only when no unique index exists on users.email.
SET @has_unique_email := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND NON_UNIQUE = 0
    AND COLUMN_NAME = 'email'
);
SET @add_unique_sql := IF(
  @has_unique_email = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_email (email)',
  'SELECT 1'
);
PREPARE add_unique_stmt FROM @add_unique_sql;
EXECUTE add_unique_stmt;
DEALLOCATE PREPARE add_unique_stmt;
