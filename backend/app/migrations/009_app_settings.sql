CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT PRIMARY KEY,
  shift_start_time TIME NOT NULL DEFAULT '09:00:00',
  grace_period_mins INT NOT NULL DEFAULT 15,
  fine_per_minute_pkr DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO app_settings (id, shift_start_time, grace_period_mins, fine_per_minute_pkr)
VALUES (1, '09:00:00', 15, 0.00)
ON DUPLICATE KEY UPDATE id=id;
