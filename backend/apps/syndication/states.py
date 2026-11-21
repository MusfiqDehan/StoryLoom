"""Explicit state definitions and transition tables for syndication."""

from __future__ import annotations

PENDING = "pending"
DELIVERING = "delivering"
DELIVERED = "delivered"
FAILED = "failed"
ABANDONED = "abandoned"
SKIPPED = "skipped"

TERMINAL_DELIVERY_STATES = frozenset({DELIVERED})

DELIVERY_TRANSITIONS: dict[str, frozenset[str]] = {
    PENDING: frozenset({DELIVERING, DELIVERED, FAILED, ABANDONED, SKIPPED}),
    DELIVERING: frozenset({DELIVERED, FAILED, ABANDONED, SKIPPED}),
    FAILED: frozenset({PENDING, DELIVERING, DELIVERED, FAILED, ABANDONED, SKIPPED}),
    ABANDONED: frozenset({PENDING}),
    SKIPPED: frozenset({PENDING}),
    DELIVERED: frozenset(),
}

#: Derived destination circuit-breaker states.
DESTINATION_ACTIVE = "active"
DESTINATION_PAUSED = "paused"
DESTINATION_AUTO_DISABLED = "auto_disabled"
