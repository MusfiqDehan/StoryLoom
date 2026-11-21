"""Small explicit finite-state-machine primitives.

StoryLoom already models article workflow with plain dictionaries in
``apps.editorial.transitions``. This module extracts the minimal shared
contract—explicit transition maps and structured conflict errors—for the
other state machines across the codebase (review assignments, deliveries,
social posts/targets, and indexing logs) so invalid transitions fail loudly
with a machine-readable payload instead of silently corrupting state.
"""

from __future__ import annotations

from collections.abc import Mapping


class StateTransitionError(ValueError):
    """Raised when a domain object attempts an illegal state transition."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "invalid_transition",
        from_state: str = "",
        to_state: str = "",
        allowed: tuple[str, ...] = (),
    ):
        super().__init__(message)
        self.code = code
        self.from_state = from_state
        self.to_state = to_state
        self.allowed = allowed

    def to_dict(self) -> dict[str, object]:
        return {
            "detail": str(self),
            "code": self.code,
            "state": self.from_state,
            "allowed_states": list(self.allowed),
        }


def validate_transition(
    from_state: str,
    to_state: str,
    transitions: Mapping[str, frozenset[str]],
    *,
    entity: str = "item",
    code: str = "invalid_transition",
) -> str:
    """Assert that ``from_state -> to_state`` is declared in ``transitions``.

    Returns ``to_state`` on success so callers can chain it directly.
    """
    allowed = transitions.get(from_state, frozenset())
    if to_state not in allowed:
        raise StateTransitionError(
            f"Cannot transition {entity} from '{from_state}' to '{to_state}'.",
            code=code,
            from_state=from_state,
            to_state=to_state,
            allowed=tuple(sorted(allowed)),
        )
    return to_state
