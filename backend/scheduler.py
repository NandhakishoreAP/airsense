import logging
import os
import sys
import time
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_ingestion.fetch_aqi import fetch_and_store_aqi
from data_ingestion.fetch_weather import fetch_and_store_weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


scheduler = BackgroundScheduler(timezone=timezone.utc)


def _log_timestamp():
    return datetime.now(timezone.utc).isoformat()


def safe_fetch_aqi():
    started_at = _log_timestamp()
    logger.info(f"[{started_at}] AQI fetch started")
    try:
        result = fetch_and_store_aqi()
        completed_at = _log_timestamp()
        logger.info(f"[{completed_at}] AQI fetch completed: {result}")
    except Exception as exc:
        logger.warning(f"[{_log_timestamp()}] AQI fetch failed: {exc}")


def safe_fetch_weather():
    started_at = _log_timestamp()
    logger.info(f"[{started_at}] Weather fetch started")
    try:
        result = fetch_and_store_weather()
        completed_at = _log_timestamp()
        logger.info(f"[{completed_at}] Weather fetch completed: {result}")
    except Exception as exc:
        logger.warning(f"[{_log_timestamp()}] Weather fetch failed: {exc}")


def start_scheduler():
    # Vulnerable sites are static (schools/hospitals do not move), so fetch_vulnerable_sites.py
    # is intentionally NOT scheduled on a recurring basis.
    scheduler.add_job(
        safe_fetch_aqi,
        trigger="interval",
        minutes=60,
        next_run_time=datetime.now(timezone.utc),
        id="fetch_aqi_job",
        replace_existing=True,
        coalesce=False,
        max_instances=1,
    )
    scheduler.add_job(
        safe_fetch_weather,
        trigger="interval",
        minutes=60,
        next_run_time=datetime.now(timezone.utc),
        id="fetch_weather_job",
        replace_existing=True,
        coalesce=False,
        max_instances=1,
    )
    scheduler.start()
    logger.info(f"[{_log_timestamp()}] Scheduler started")


if __name__ == "__main__":
    try:
        start_scheduler()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        scheduler.shutdown(wait=False)
        print("Scheduler stopped")
