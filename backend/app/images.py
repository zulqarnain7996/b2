from __future__ import annotations

import os
import uuid
from pathlib import Path

import cv2

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "backend/uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _safe_square_crop(image_bgr, bbox):
    h, w = image_bgr.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    cx = (x1 + x2) // 2
    cy = (y1 + y2) // 2
    side = int(max(x2 - x1, y2 - y1) * 1.25)
    side = max(64, side)

    sx1 = max(0, cx - side // 2)
    sy1 = max(0, cy - side // 2)
    sx2 = min(w, sx1 + side)
    sy2 = min(h, sy1 + side)

    # Readjust start so crop remains square at boundaries.
    sx1 = max(0, sx2 - side)
    sy1 = max(0, sy2 - side)

    return image_bgr[sy1:sy2, sx1:sx2]


def create_thumbnail(image_bgr, bbox, employee_id: str) -> str:
    crop = _safe_square_crop(image_bgr, bbox)
    thumb = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_AREA)
    filename = f"{employee_id}_{uuid.uuid4().hex[:12]}.jpg"
    file_path = UPLOAD_DIR / filename
    cv2.imwrite(str(file_path), thumb, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return f"/uploads/{filename}"
