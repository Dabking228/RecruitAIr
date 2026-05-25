"""
Company service — business logic for company profile operations.
Each recruiter has at most one company in the MVP.
"""
from app.db.supabase_client import supabase


def get_company_by_recruiter(recruiter_id: str) -> dict | None:
    """
    Returns the recruiter's company, or None if they haven't
    created one yet.
    """
    result = (
        supabase.table("companies")
        .select("*")
        .eq("created_by", recruiter_id)
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]
    return None


def create_company(
    recruiter_id: str,
    name: str,
    industry: str | None = None,
    website: str | None = None,
) -> dict:
    """
    Creates a new company profile for the recruiter.
    Raises an error if they already have one.
    """
    # Check for existing company to prevent duplicates
    existing = get_company_by_recruiter(recruiter_id)
    if existing:
        raise ValueError("You already have a company profile.")

    result = (
        supabase.table("companies")
        .insert({
            "name": name,
            "industry": industry,
            "website": website,
            "created_by": recruiter_id,
        })
        .execute()
    )
    return result.data[0]