"""In-process performance metrics (per-route)."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Deque, Dict, List


@dataclass
class RouteStats:
    """Aggregate metrics for a single route."""
    count: int = 0
    error_count: int = 0
    total_ms: float = 0.0
    max_ms: float = 0.0
    latencies_ms: Deque[float] = field(default_factory=lambda: deque(maxlen=1000))

    def record(self, elapsed_ms: float, errored: bool) -> None:
        self.count += 1
        if errored:
            self.error_count += 1
        self.total_ms += elapsed_ms
        if elapsed_ms > self.max_ms:
            self.max_ms = elapsed_ms
        self.latencies_ms.append(elapsed_ms)


class PerfStore:
    """Thread-safe store for route metrics."""
    def __init__(self) -> None:
        self._lock = Lock()
        self._routes: Dict[str, RouteStats] = {}

    def record(self, route_key: str, elapsed_ms: float, errored: bool) -> None:
        with self._lock:
            stats = self._routes.get(route_key)
            if stats is None:
                stats = RouteStats()
                self._routes[route_key] = stats
            stats.record(elapsed_ms, errored)

    def snapshot(self) -> Dict[str, dict]:
        with self._lock:
            return {key: _stats_snapshot(stats) for key, stats in self._routes.items()}


def _percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    k = int(round((len(values) - 1) * p))
    return values[k]


def _stats_snapshot(stats: RouteStats) -> dict:
    values = sorted(stats.latencies_ms)
    avg_ms = (stats.total_ms / stats.count) if stats.count else 0.0
    return {
        "count": stats.count,
        "errors": stats.error_count,
        "avg_ms": round(avg_ms, 2),
        "p95_ms": round(_percentile(values, 0.95), 2),
        "p99_ms": round(_percentile(values, 0.99), 2),
        "max_ms": round(stats.max_ms, 2),
    }


_STORE = PerfStore()
_WORKERS = PerfStore()


def record_route_latency(route_key: str, elapsed_ms: float, errored: bool) -> None:
    """Record latency for a route."""
    _STORE.record(route_key, elapsed_ms, errored)


def get_perf_snapshot() -> Dict[str, dict]:
    """Return current perf stats."""
    return _STORE.snapshot()


def record_worker_latency(worker_key: str, elapsed_ms: float, errored: bool) -> None:
    """Record latency for a worker loop or operation."""
    _WORKERS.record(worker_key, elapsed_ms, errored)


def get_worker_snapshot() -> Dict[str, dict]:
    """Return current worker stats."""
    return _WORKERS.snapshot()
