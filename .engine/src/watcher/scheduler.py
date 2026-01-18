"""Lightweight timer scheduler for local tasks."""

from __future__ import annotations

import threading
from datetime import datetime, timedelta
from typing import Callable


class Scheduler:
    def __init__(self):
        self._timers: list[threading.Timer] = []

    def schedule_at(self, when: datetime, callback: Callable[[], None]) -> None:
        delay = max((when - datetime.now()).total_seconds(), 0)
        timer = threading.Timer(delay, callback)
        timer.daemon = True
        timer.start()
        self._timers.append(timer)

    def schedule_in(self, delta: timedelta, callback: Callable[[], None]) -> None:
        self.schedule_at(datetime.now() + delta, callback)

    def cancel_all(self) -> None:
        for timer in self._timers:
            timer.cancel()
        self._timers.clear()


class PeriodicCallback:
    """Simple periodic runner used by watcher modules."""

    def __init__(self, *, interval_sec: int, callback: Callable[[], None]):
        if interval_sec <= 0:
            raise ValueError("interval_sec must be positive")
        self.interval_sec = interval_sec
        self.callback = callback
        self._timer: threading.Timer | None = None
        self._stopped = True

    def _run(self):
        if self._stopped:
            return
        try:
            self.callback()
        finally:
            self._schedule_next()

    def _schedule_next(self):
        if self._stopped:
            return
        self._timer = threading.Timer(self.interval_sec, self._run)
        self._timer.daemon = True
        self._timer.start()

    def start(self, *, immediate: bool = False):
        if not self._stopped:
            return
        self._stopped = False
        if immediate:
            self.callback()
        self._schedule_next()

    def stop(self):
        self._stopped = True
        if self._timer:
            self._timer.cancel()
            self._timer = None
