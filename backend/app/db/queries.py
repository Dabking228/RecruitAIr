"""
Reusable database query helpers.
Import 'supabase' from supabase_client and write
clean query functions here instead of in service files.
This keeps service files focused on business logic.
"""
from app.db.supabase_client import supabase


async def get_user_by_id(user_id: str) -> dict | None:
    """Fetch a user row from public.users by their UUID."""
    result = supabase.table("users").select("*").eq("id", user_id).single().execute()
    return result.data


async def get_job_by_id(job_id: str) -> dict | None:
    """Fetch a job and its company name."""
    result = (
        supabase.table("jobs")
        .select("*, companies(name)")
        .eq("id", job_id)
        .single()
        .execute()
    )
    return result.data