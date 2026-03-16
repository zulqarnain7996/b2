-- Detect duplicate employee links in users table.
SELECT employee_id, COUNT(*) AS linked_users
FROM users
WHERE employee_id IS NOT NULL
GROUP BY employee_id
HAVING COUNT(*) > 1;

-- Show duplicate rows (keeps lowest user id linked).
SELECT u.*
FROM users u
JOIN (
  SELECT employee_id, MIN(id) AS keep_user_id
  FROM users
  WHERE employee_id IS NOT NULL
  GROUP BY employee_id
  HAVING COUNT(*) > 1
) d ON d.employee_id = u.employee_id
ORDER BY u.employee_id, u.id;

-- Fix duplicates: keep the smallest user id per employee_id; set others to NULL.
UPDATE users u
JOIN (
  SELECT u1.id
  FROM users u1
  JOIN users u2
    ON u1.employee_id = u2.employee_id
   AND u1.employee_id IS NOT NULL
   AND u1.id > u2.id
) extra ON extra.id = u.id
SET u.employee_id = NULL;
