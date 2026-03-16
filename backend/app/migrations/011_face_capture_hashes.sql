CREATE TABLE IF NOT EXISTS face_capture_hashes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  image_hash CHAR(64) NOT NULL UNIQUE,
  employee_id INT NULL,
  context ENUM('enroll','checkin') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
