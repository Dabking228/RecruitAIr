"""
Audit logging utility.

log_action() is fire-and-forget — exceptions are logged but never re-raised.
A broken audit log write must never crash the main workflow.

Action naming convention: domain.event (e.g. 'application.submitted')
Target: always 'application' + the application UUID, since all key events
        in this system are anchored to a specific application.
"""
import logging
from app.db.supabase_client import supabase

logger = logging.getLogger(__name__)


def log_action(
    user_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    """
    Inserts one row into audit_logs. Always returns None — never raises.

    Args:
        user_id:     Auth user who triggered the action. Pass None for
                     background tasks (e.g. auto-scoring after apply).
        action:      Dot-namespaced string: 'application.submitted',
                     'score.generated', 'questions.saved',
                     'email.sent', 'application.status_changed'.
        target_type: Entity kind affected. Always 'application' for now.
        target_id:   UUID of the application. Used for recruiter filtering.
        metadata:    Extra context stored as JSONB (job_title, new_status, …).
    """
    try:
        row: dict = {"action": action}
        if user_id:
            row["user_id"] = user_id
        if target_type:
            row["target_type"] = target_type
        if target_id:
            row["target_id"] = target_id
        if metadata:
            row["metadata"] = metadata

        supabase.table("audit_logs").insert(row).execute()
        logger.debug(f"Audit: {action} | target={target_id} | user={user_id}")
    except Exception as exc:
        # Never re-raise — audit failures must not crash the main flow
        logger.warning(f"Audit log failed for '{action}': {exc}")


def get_recruiter_audit_logs(recruiter_id: str, limit: int = 50) -> list[dict]:
    """
    Returns the most recent audit logs for all applications that belong
    to this recruiter's jobs. Three explicit queries — same philosophy
    as the rest of the codebase (no complex PostgREST joins).

    Security: a recruiter can only see logs anchored to their own applications.
    """
    # Query 1: all job IDs this recruiter owns
    jobs_result = (
        supabase.table("jobs")
        .select("id")
        .eq("recruiter_id", recruiter_id)
        .execute()
    )
    job_ids = [j["id"] for j in (jobs_result.data or [])]
    if not job_ids:
        return []

    # Query 2: all application IDs for those jobs
    apps_result = (
        supabase.table("applications")
        .select("id")
        .in_("job_id", job_ids)
        .execute()
    )
    app_ids = [a["id"] for a in (apps_result.data or [])]
    if not app_ids:
        return []

    # Query 3: audit logs where target_id is one of those application UUIDs
    logs_result = (
        supabase.table("audit_logs")
        .select("*")
        .in_("target_id", app_ids)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return logs_result.data or []