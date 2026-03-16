from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from dotenv import load_dotenv
from insightface.app import FaceAnalysis

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass
class FaceResult:
    bbox: np.ndarray
    embedding: np.ndarray
    confidence: float
    kps: np.ndarray | None = None


class FaceEngine:
    def __init__(self):
        self.threshold = float(os.getenv("FACE_THRESHOLD", "0.42"))
        self.blur_threshold = float(os.getenv("FACE_BLUR_THRESHOLD", "60"))
        self.min_face_area_ratio = float(os.getenv("FACE_MIN_AREA_RATIO", "0.075"))
        self._model = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
        self._model.prepare(ctx_id=-1, det_size=(640, 640))

    def decode_image(self, image_base64: str) -> np.ndarray:
        raw = image_base64.split(",")[-1]
        binary = base64.b64decode(raw)
        arr = np.frombuffer(binary, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image payload")
        return img

    def detect_and_embed(self, image_bgr: np.ndarray) -> FaceResult:
        faces = self._model.get(image_bgr)
        if not faces:
            raise ValueError("No face detected. Keep your face in frame.")
        if len(faces) > 1:
            raise ValueError("Multiple faces detected. Only one person allowed.")
        face = faces[0]
        h, w = image_bgr.shape[:2]
        x1, y1, x2, y2 = np.asarray(face.bbox, dtype=np.float32)
        face_area_ratio = float(max(0.0, (x2 - x1) * (y2 - y1)) / max(1.0, float(w * h)))
        if face_area_ratio < self.min_face_area_ratio:
            raise ValueError("Face too far. Move closer to the camera.")
        emb = np.asarray(face.embedding, dtype=np.float32)
        emb = emb / max(np.linalg.norm(emb), 1e-8)
        kps = np.asarray(getattr(face, "kps", None), dtype=np.float32) if getattr(face, "kps", None) is not None else None
        return FaceResult(
            bbox=np.asarray(face.bbox, dtype=np.float32),
            embedding=emb,
            confidence=float(face.det_score),
            kps=kps,
        )

    def quality_checks(self, image_bgr: np.ndarray, bbox: np.ndarray, kps: np.ndarray | None = None) -> None:
        h, w = image_bgr.shape[:2]
        x1, y1, x2, y2 = bbox.astype(int)
        x1 = max(0, x1)
        y1 = max(0, y1)
        x2 = min(w, x2)
        y2 = min(h, y2)
        face_crop = image_bgr[y1:y2, x1:x2]
        if face_crop.size == 0:
            raise ValueError("Invalid face crop")

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        face_area_ratio = float((face_crop.shape[0] * face_crop.shape[1]) / max(h * w, 1))
        # Small faces naturally produce a lower Laplacian variance; keep checks strict but adaptive.
        adaptive_factor = 0.8 if face_area_ratio < 0.08 else 1.0
        min_blur_threshold = max(25.0, self.blur_threshold * adaptive_factor)

        if brightness < 55:
            raise ValueError("Low light")
        if blur_score < min_blur_threshold:
            raise ValueError("Too blurry")
        if kps is not None and kps.shape[0] >= 2:
            lx, ly = float(kps[0][0]), float(kps[0][1])
            rx, ry = float(kps[1][0]), float(kps[1][1])
            eye_tilt = abs(ly - ry) / max(8.0, abs(rx - lx))
            if eye_tilt > 0.28:
                raise ValueError("Look straight")

    @staticmethod
    def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
        n1 = np.linalg.norm(v1)
        n2 = np.linalg.norm(v2)
        if n1 == 0 or n2 == 0:
            return 0.0
        return float(np.dot(v1, v2) / (n1 * n2))


face_engine = FaceEngine()
