from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import jobs, applications, candidates, documents, claims, ai

# ── App initialisation ────────────────────────────────────────
app = FastAPI(
    title="RecruitAIr API",
    description="Evidence-Aware AI Recruitment Assistant",
    version="0.1.0",
    # In production, disable docs to avoid exposing your API structure
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url="/redoc" if settings.APP_ENV == "development" else None,
)

# ── CORS Middleware ───────────────────────────────────────────
# Must be added BEFORE routers or it won't apply to all routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,   # Allows cookies/auth headers
    allow_methods=["*"],      # GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],      # Authorization, Content-Type, etc.
)

# ── Routers ───────────────────────────────────────────────────
# Each router is mounted at a prefix. All routes inside that
# router are relative to the prefix.
#
# Example: jobs router has GET "/" → accessible as GET /api/jobs/
#          jobs router has POST "/" → accessible as POST /api/jobs/
app.include_router(jobs.router,         prefix="/api/jobs",         tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Applications"])
app.include_router(candidates.router,   prefix="/api/candidate",    tags=["Candidates"])
app.include_router(documents.router,    prefix="/api/documents",    tags=["Documents"])
app.include_router(claims.router,       prefix="/api/claims",       tags=["Claims"])
app.include_router(ai.router,           prefix="/api/ai",           tags=["AI"])

# ── Health Check ──────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Simple health check endpoint.
    Used by Cloud Run to verify the container is running.
    """
    return {
        "status": "healthy",
        "environment": settings.APP_ENV,
        "version": "0.1.0",
    }


# ── Root ──────────────────────────────────────────────────────
@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "RecruitAIr API",
        "docs": "/docs",
        "health": "/health",
    }