from __future__ import annotations

import threading
import time
from typing import Any

_lock = threading.Lock()
_store: dict[str, tuple[float, Any]] = {}


def get(key: str) -> Any | None:
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires_at, value = item
        if time.time() > expires_at:
            _store.pop(key, None)
            return None
        return value


def set_value(key: str, value: Any, ttl_seconds: int) -> None:
    with _lock:
        _store[key] = (time.time() + ttl_seconds, value)


def invalidate(prefix: str) -> None:
    with _lock:
        keys = [k for k in _store.keys() if k.startswith(prefix)]
        for k in keys:
            _store.pop(k, None)
