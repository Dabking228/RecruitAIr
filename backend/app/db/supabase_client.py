from supabase import create_client, Client
from app.config import settings

# Create one Supabase client for the whole app.
# The service role key bypasses Row Level Security —
# the backend is responsible for its own authorization checks.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY
)