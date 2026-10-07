from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging

import config
import database
from scheduler import start_scheduler, scheduler
from utils.freshness import metadata
from utils.time import iso_now
from api.routes import router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# Allow all origins/methods/headers for dev (Vite frontend on different port)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)


@app.on_event("startup")
def on_startup():
    """Ensure the SQLite database and tables exist before handling requests."""
    logger.info("Running database.init_db() on startup")
    database.init_db()
    if config.ENABLE_IN_PROCESS_SCHEDULER:
        start_scheduler()
    logger.info("Database initialized")


@app.on_event("shutdown")
def on_shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)


@app.get("/api/health")
def health():
    """Report service, persistence, ingestion, model, and LLM readiness."""
    conn = database.get_connection()
    try:
        rows = conn.execute("SELECT source, city, last_success_at, last_status, last_error FROM ingestion_status").fetchall()
    finally:
        conn.close()
    ingestion = {}
    for source, city, last_success, last_status, last_error in rows:
        ingestion.setdefault(source, {})[city] = {
            "status": last_status or "unknown",
            "last_updated": last_success,
            "freshness": metadata(source, last_success, last_success)["freshness"] if last_success else "unavailable",
            "error": last_error,
        }
    degraded = any(value["freshness"] in ("stale", "unavailable") for source in ingestion.values() for value in source.values())
    return {
        "status": "degraded" if degraded else "ok",
        "checked_at": iso_now(),
        "database": "ok",
        "cities": list(config.CITIES.keys()),
        "scheduler": {
            "status": "running" if scheduler.running else "stopped",
            "mode": "apscheduler" if config.ENABLE_IN_PROCESS_SCHEDULER else "external_cron",
        },
        "ingestion": ingestion,
        "forecast_model": {"status": "ok" if __import__("os").path.exists(__import__("os").path.join(__import__("os").path.dirname(__file__), "ml", "model.json")) else "fallback"},
        "gemini": {"status": "configured" if config.GEMINI_API_KEY else "unconfigured"},
    }


if __name__ == "__main__":
    # Start uvicorn so the server can be started with: python main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
