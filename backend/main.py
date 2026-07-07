from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging

import config
import database
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
    logger.info("Database initialized")


@app.get("/api/health")
def health():
    """Simple healthcheck returning configured cities."""
    return {"status": "ok", "cities": list(config.CITIES.keys())}


if __name__ == "__main__":
    # Start uvicorn so the server can be started with: python main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
