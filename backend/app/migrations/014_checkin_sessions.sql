CREATE TABLE IF NOT EXISTS checkin_sessions (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  employee_id INT NULL,
  matched_employee_id INT NULL,
  challenge_type ENUM('blink','turn_head_left','turn_head_right') NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'started',
  retries INT NOT NULL DEFAULT 0,
  confidence FLOAT NULL,
  device_info VARCHAR(255) NULL,
  device_ip VARCHAR(64) NULL,
  notes VARCHAR(255) NULL,
  verified_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  KEY idx_checkin_sessions_user (user_id),
  KEY idx_checkin_sessions_state (state),
  KEY idx_checkin_sessions_expires (expires_at),
  CONSTRAINT fk_checkin_sessions_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_checkin_sessions_employee FOREIGN KEY (employee_id)
    REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT fk_checkin_sessions_matched_employee FOREIGN KEY (matched_employee_id)
    REFERENCES employees(id) ON DELETE SET NULL
);
