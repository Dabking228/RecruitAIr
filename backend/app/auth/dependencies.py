import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

# HTTPBearer automatically reads the Authorization: Bearer <token> header
security = HTTPBearer()

# Supabase signs JWTs with RS256 (asymmetric). We fetch their public key from
# the JWKS endpoint so we can verify tokens without holding any secret.
# PyJWKClient caches the keys and auto-rotates when Supabase rotates theirs.
_jwks_client = PyJWKClient(
    f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
)

class CurrentUser:
    """Represents the authenticated user extracted from the JWT."""
    def __init__(self, user_id: str, email: str, role: str):
        self.user_id = user_id
        self.email = email
        self.role = role

    def __repr__(self):
        return f"<CurrentUser id={self.user_id} role={self.role}>"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CurrentUser:
    """
    Dependency: verifies the JWT and returns the current user.
    Use with: current_user: CurrentUser = Depends(get_current_user)
    """
    token = credentials.credentials

    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",   # Supabase always sets this audience
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please log in again.",
        )
    except (jwt.InvalidTokenError, PyJWKClientError) as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
        )

    user_id: str | None = payload.get("sub")
    email: str | None = payload.get("email")

    # Our custom role is stored in user_metadata (set during signup)
    user_metadata: dict = payload.get("user_metadata") or {}
    role: str | None = user_metadata.get("role")

    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing required claims.",
        )

    return CurrentUser(user_id=user_id, email=email or "", role=role)


async def require_recruiter(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Dependency: only allows recruiters through.
    Use on any route that is recruiter-only.
    """
    if current_user.role != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires a recruiter account.",
        )
    return current_user


async def require_candidate(
    current_user: CurrentUser = Depends(get_current_user),
) -> CurrentUser:
    """
    Dependency: only allows candidates through.
    Use on any route that is candidate-only.
    """
    if current_user.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires a candidate account.",
        )
    return current_user