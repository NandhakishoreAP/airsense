import logging
import os
import sys
from datetime import datetime, timezone

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
import database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WAQI_API_BASE = "https://api.waqi.info/feed"


def _fetch_waqi_json(url):
    response = requests.get(url, timeout=10)
    response.raise_for_status()
    return response.json()


def _extract_waqi_reading(payload, city_label, fallback_geo=None):
    # Example WAQI response structure:
    # {
    #   "status": "ok",
    #   "data": {
    #     "aqi": 173,
    #     "city": {
    #       "name": "Chennai US Consulate, Chennai, Tamil Nadu, India",
    #       "geo": [13.0674, 80.2376]
    #     },
    #     "time": {
    #       "iso": "2026-07-05T10:00:00+05:30"
    #     }
    #   }
    # }
    status = payload.get("status")
    if status != "ok":
        return None, f"WAQI status={status!r}"

    data = payload.get("data") or {}
    aqi_value = data.get("aqi")
    if aqi_value in (None, "-"):
        return None, "missing AQI value"

    city_data = data.get("city") or {}
    station_name = city_data.get("name") or city_label
    geo = city_data.get("geo") or fallback_geo or [None, None]
    latitude = geo[0] if len(geo) > 0 else None
    longitude = geo[1] if len(geo) > 1 else None
    recorded_at = (data.get("time") or {}).get("iso")

    if latitude is None or longitude is None:
        return None, "missing station coordinates"
    if not recorded_at:
        return None, "missing observation timestamp"

    return {
        "station_name": station_name,
        "latitude": latitude,
        "longitude": longitude,
        "aqi_value": aqi_value,
        "recorded_at": recorded_at,
    }, None


def fetch_and_store_aqi():
    """
    Fetch live AQI readings from WAQI for all cities and store in SQLite.
    Returns a dict with counts of readings inserted per city.
    """
    results = {city: 0 for city in config.CITIES}

    for city, coords in config.CITIES.items():
        try:
            logger.info(f"Fetching WAQI data for {city}...")

            fetched_at = datetime.now(timezone.utc).isoformat()
            station_candidates = [
                (f"{WAQI_API_BASE}/{city}/?token={config.WAQI_API_TOKEN}", None, "city-name"),
                (
                    f"{WAQI_API_BASE}/geo:{coords['latitude']};{coords['longitude']}/?token={config.WAQI_API_TOKEN}",
                    [coords["latitude"], coords["longitude"]],
                    "geo-fallback",
                ),
            ]

            conn = database.get_connection()
            cursor = conn.cursor()

            city_inserted = 0
            city_successful = False

            for url, fallback_geo, lookup_kind in station_candidates:
                try:
                    payload = _fetch_waqi_json(url)
                except requests.exceptions.RequestException as exc:
                    logger.warning(f"WAQI request failed for {city} ({lookup_kind}): {exc}")
                    continue

                reading, reason = _extract_waqi_reading(payload, city, fallback_geo=fallback_geo)
                if reading is None:
                    logger.warning(f"WAQI data unavailable for {city} ({lookup_kind}): {reason}")
                    continue

                cursor.execute(
                    """
                    INSERT INTO aqi_readings
                    (city, station_name, latitude, longitude, aqi_value, recorded_at, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        city,
                        reading["station_name"],
                        reading["latitude"],
                        reading["longitude"],
                        reading["aqi_value"],
                        reading["recorded_at"],
                        fetched_at,
                    ),
                )
                city_inserted += 1
                city_successful = True
                break

            if not city_successful:
                logger.warning(f"No usable WAQI AQI reading found for {city}")

            results[city] = city_inserted


            conn.commit()
            conn.close()

            logger.info(f"Inserted {city_inserted} readings for {city}")

        except Exception as e:
            logger.warning(f"Error processing {city}: {e}")

    return results


if __name__ == "__main__":
    logger.info("Starting AQI fetch and store...")
    results = fetch_and_store_aqi()
    logger.info("AQI fetch complete.")
    for city, count in results.items():
        print(f"{city}: {count} readings inserted")
