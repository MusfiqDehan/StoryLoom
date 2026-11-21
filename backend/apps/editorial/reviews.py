"""Explicit state machine for editorial review assignments & comments."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from common.fsm import StateTransitionError, validate_transition

PENDING = "pending"
APPROVED = "approved"
CHANGES_REQUESTED = "changes_requested"
CANCELLED = "cancelled"

RESOLUTION_STATES = frozenset({APPROVED, CHANGES_REQUESTED, CANCELLED})

ASSIGNMENT_TRANSITIONS: dict[str, frozenset[str]] = {
    PENDING: RESOLUTION_STATES,
    APPROVED: frozenset(),
    CHANGES_REQUESTED: frozenset(),
    CANCELLED: frozenset(),
}


class ReviewTransitionError(StateTransitionError):
    """Raised when resolving a review assignment violates its lifecycle."""


def resolve_assignment(assignment, to_state: str):
    """Transition a pending ``ReviewAssignment`` to a terminal resolution."""
    with transaction.atomic():
        locked = type(assignment).objects.select_for_update().get(pk=assignment.pk)
        try:
            validate_transition(
                locked.state,
                to_state,
                ASSIGNMENT_TRANSITIONS,
                entity="review assignment",
                code="already_resolved",
            )
        except StateTransitionError as exc:
            raise ReviewTransitionError(
                f"Review assignment is already '{locked.state}' and cannot be changed to '{to_state}'.",
                code=exc.code,
                from_state=exc.from_state,
                to_state=exc.to_state,
                allowed=exc.allowed,
            ) from exc

        locked.state = to_state
        locked.resolved_at = timezone.now()
        locked.save(update_fields=["state", "resolved_at"])
        assignment.state = locked.state
        assignment.resolved_at = locked.resolved_at
        return assignment


def resolve_comment(comment, *, user):
    """Mark a ``ReviewComment`` as resolved (idempotent on already-resolved)."""
    comment.is_resolved = True
    comment.resolved_by = user
    comment.resolved_at = timezone.now()
    comment.save(update_fields=["is_resolved", "resolved_by", "resolved_at"])
    return comment


def reopen_comment(comment):
    """Reopen a previously resolved ``ReviewComment``."""
    if not comment.is_resolved:
        return comment
    comment.is_resolved = False
    comment.resolved_by = None
    comment.resolved_at = None
    comment.save(update_fields=["is_resolved", "resolved_by", "resolved_at"])
    return comment
