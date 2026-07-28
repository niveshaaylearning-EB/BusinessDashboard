from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine, Base
from app.limiter import limiter
from app.routers.auth  import router as auth_router
from app.routers.data  import router as data_router
from app.routers.audit import router as audit_router
from app.routers.admin import router as admin_router

# Auto-create all tables on startup (idempotent — safe to run repeatedly)
Base.metadata.create_all(bind=engine)

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NIA Antigravity API",
    description="Secure backend for NIA Subscription Intelligence Platform",
    version="1.0.0",
    docs_url="/docs"         if settings.environment == "development" else None,
    redoc_url="/redoc"       if settings.environment == "development" else None,
    openapi_url="/openapi.json" if settings.environment == "development" else None,
)

# ─── Rate Limiting ────────────────────────────────────────────────────────────
# Global: 300 req/minute. Login endpoint has its own 5/minute limit (in auth router).
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — please wait a moment and try again."},
    )


# ─── Security Headers ─────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Prevent browsers from rendering the page inside a frame (clickjacking)
    response.headers["X-Frame-Options"] = "DENY"
    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Force HTTPS for 1 year once served over TLS
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Referrer policy — don't leak URL to external sites
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Restrict powerful browser features
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # Content Security Policy — only allow resources from same origin
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "   # React build needs inline scripts
        "style-src 'self' 'unsafe-inline'; "    # Inline styles used by Recharts/UI
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self' http://localhost:8000 https://localhost:8000; "
        "frame-ancestors 'none';"
    )
    return response


# ─── Middleware ───────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    # Allow localhost/127.0.0.1 on any port (Vite bumps ports when 5173 is taken) and
    # any device on the same local WiFi network (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|(192\.168|10\.\d+|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+):\d+",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth_router,  prefix="/auth",  tags=["Authentication"])
app.include_router(data_router,  prefix="/data",  tags=["Data"])
app.include_router(audit_router, prefix="/audit", tags=["Audit"])
app.include_router(admin_router, prefix="/admin", tags=["Admin"])


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "nia-antigravity-api", "version": "1.0.0"}
