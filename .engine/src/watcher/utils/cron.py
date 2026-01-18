"""Minimal cron expression matcher (minute hour day month weekday)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List, Set


def _expand_token(token: str, minimum: int, maximum: int) -> Set[int]:
    """Expand a cron token (supports ranges, commas, and steps)."""
    values: Set[int] = set()
    parts = token.split(",")
    for part in parts:
        part = part.strip()
        if not part:
            continue
        step = 1
        if "/" in part:
            part, step_str = part.split("/", 1)
            step = max(int(step_str), 1)
        if part == "*":
            values.update(range(minimum, maximum + 1, step))
            continue
        if "-" in part:
            start_str, end_str = part.split("-", 1)
            start = int(start_str)
            end = int(end_str)
        else:
            start = end = int(part)
        start = max(start, minimum)
        end = min(end, maximum)
        values.update(range(start, end + 1, step))
    return values


@dataclass
class CronField:
    values: Set[int]
    wildcard: bool

    @classmethod
    def parse(cls, token: str, *, minimum: int, maximum: int) -> "CronField":
        token = token.strip()
        wildcard = token == "*"
        if wildcard:
            values = set(range(minimum, maximum + 1))
        else:
            values = _expand_token(token, minimum, maximum)
        return cls(values=values, wildcard=wildcard)

    def matches(self, value: int) -> bool:
        return self.wildcard or value in self.values


class CronSchedule:
    """Basic cron matcher for 5-field expressions."""

    def __init__(self, expression: str):
        tokens = expression.split()
        if len(tokens) != 5:
            raise ValueError(f"Invalid cron expression '{expression}'")
        minute, hour, dom, month, dow = tokens
        self.minute = CronField.parse(minute, minimum=0, maximum=59)
        self.hour = CronField.parse(hour, minimum=0, maximum=23)
        self.day_of_month = CronField.parse(dom, minimum=1, maximum=31)
        self.month = CronField.parse(month, minimum=1, maximum=12)
        # weekday 0=Sunday to 6=Saturday (align with cron)
        self.day_of_week = CronField.parse(dow, minimum=0, maximum=6)

    def matches(self, dt: datetime) -> bool:
        minute = dt.minute
        hour = dt.hour
        dom = dt.day
        month = dt.month
        dow = (dt.weekday() + 1) % 7  # convert Monday=0 → 1, Sunday=6 → 0
        dom_match = self.day_of_month.matches(dom)
        dow_match = self.day_of_week.matches(dow)
        if self.day_of_month.wildcard and self.day_of_week.wildcard:
            dom_dow_ok = True
        elif self.day_of_month.wildcard:
            dom_dow_ok = dow_match
        elif self.day_of_week.wildcard:
            dom_dow_ok = dom_match
        else:
            dom_dow_ok = dom_match or dow_match
        return (
            self.minute.matches(minute)
            and self.hour.matches(hour)
            and self.month.matches(month)
            and dom_dow_ok
        )


__all__ = ["CronSchedule"]
