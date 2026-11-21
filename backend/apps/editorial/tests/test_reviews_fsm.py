"""Finite-state-machine guarantees for review assignments and comments."""

import pytest

from apps.editorial.models import ReviewAssignment, ReviewComment
from apps.editorial.reviews import ReviewTransitionError, reopen_comment, resolve_assignment

pytestmark = pytest.mark.django_db

BASE = "/api/v1/studio"


class TestReviewAssignmentFSM:
    def test_resolving_an_already_resolved_assignment_returns_409(
        self, auth_client, editor, writer, article_factory
    ):
        article = article_factory(status="draft", author=writer)
        assignment = ReviewAssignment.objects.create(
            site=article.site, article=article, assignee=editor
        )

        first = auth_client(editor).post(
            f"{BASE}/reviews/{assignment.pk}/resolve/",
            {"state": "approved"},
            format="json",
        )
        assert first.status_code == 200
        assert first.json()["state"] == "approved"

        second = auth_client(editor).post(
            f"{BASE}/reviews/{assignment.pk}/resolve/",
            {"state": "cancelled"},
            format="json",
        )
        assert second.status_code == 409
        assert second.json()["code"] == "already_resolved"
        assert second.json()["state"] == "approved"
        assert second.json()["allowed_states"] == []

        assignment.refresh_from_db()
        assert assignment.state == "approved"

    def test_resolve_assignment_helper_rejects_terminal_state(
        self, editor, writer, article_factory
    ):
        article = article_factory(status="draft", author=writer)
        assignment = ReviewAssignment.objects.create(
            site=article.site,
            article=article,
            assignee=editor,
            state="changes_requested",
        )
        with pytest.raises(ReviewTransitionError) as exc:
            resolve_assignment(assignment, "approved")
        assert exc.value.code == "already_resolved"


class TestReviewCommentLifecycle:
    def test_resolve_and_reopen_via_api(
        self, auth_client, editor, writer, article_factory
    ):
        article = article_factory(status="draft", author=writer)
        comment = ReviewComment.objects.create(
            site=article.site, article=article, author=editor, body="Tighten lede"
        )
        client = auth_client(editor)

        resolved = client.post(f"{BASE}/comments/{comment.pk}/resolve/")
        assert resolved.status_code == 200
        assert resolved.json()["is_resolved"] is True
        assert resolved.json()["resolved_at"] is not None

        reopened = client.post(
            f"{BASE}/comments/{comment.pk}/resolve/",
            {"action": "reopen"},
            format="json",
        )
        assert reopened.status_code == 200
        assert reopened.json()["is_resolved"] is False
        assert reopened.json()["resolved_by"] is None
        assert reopened.json()["resolved_at"] is None

        # Invalid action rejected explicitly.
        bad = client.post(
            f"{BASE}/comments/{comment.pk}/resolve/",
            {"action": "delete"},
            format="json",
        )
        assert bad.status_code == 400
        comment.refresh_from_db()
        reopen_comment(comment)
        assert comment.is_resolved is False
