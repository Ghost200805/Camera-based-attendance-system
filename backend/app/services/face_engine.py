"""InsightFace wrapper: RetinaFace (detection) + ArcFace (512-d embedding)."""
import logging
import threading
from dataclasses import dataclass
from typing import List

import numpy as np

from ..config import settings

log = logging.getLogger("face_engine")


class EngineNotReady(RuntimeError):
    pass


@dataclass
class RawFace:
    bbox: tuple  # x1, y1, x2, y2 (ints, clamped to the frame)
    det_score: float
    embedding: np.ndarray  # L2-normalised, shape (512,)


class FaceEngine:
    def __init__(self):
        self._app = None
        self._lock = threading.Lock()
        self.error = None

    @property
    def ready(self) -> bool:
        return self._app is not None

    def load(self):
        """Load models (first run downloads ~280 MB to ~/.insightface)."""
        try:
            from insightface.app import FaceAnalysis

            providers = (
                ["CUDAExecutionProvider", "CPUExecutionProvider"]
                if settings.use_gpu
                else ["CPUExecutionProvider"]
            )
            app = FaceAnalysis(
                name=settings.insightface_model,
                providers=providers,
                allowed_modules=["detection", "recognition"],
            )
            app.prepare(
                ctx_id=0 if settings.use_gpu else -1,
                det_size=(settings.det_size, settings.det_size),
            )
            self._app = app
            self.error = None
            log.info("InsightFace '%s' loaded", settings.insightface_model)
        except Exception as exc:  # noqa: BLE001
            self.error = str(exc)
            log.exception("Could not load InsightFace model")

    def extract(self, bgr: np.ndarray) -> List[RawFace]:
        if not self.ready:
            raise EngineNotReady(self.error or "Face engine is still loading")
        h, w = bgr.shape[:2]
        with self._lock:
            faces = self._app.get(bgr)
        out: List[RawFace] = []
        for f in faces:
            emb = getattr(f, "normed_embedding", None)
            if emb is None:
                continue
            x1, y1, x2, y2 = [int(round(v)) for v in f.bbox]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)
            if x2 <= x1 or y2 <= y1:
                continue
            emb = np.asarray(emb, dtype=np.float32)
            n = np.linalg.norm(emb)
            if n == 0:
                continue
            out.append(RawFace((x1, y1, x2, y2), float(f.det_score), emb / n))
        return out


engine = FaceEngine()