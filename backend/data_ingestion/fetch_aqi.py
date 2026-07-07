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

            conn = database.get_connection()
            cursor = conn.cursor()

            city_inserted = 0
            city_successful = False

            # Use WAQI search endpoint to get candidate stations for the city
            search_url = f"https://api.waqi.info/search/"
            try:
                resp = requests.get(search_url, params={"keyword": city, "token": config.WAQI_API_TOKEN}, timeout=10)
                resp.raise_for_status()
                search_payload = resp.json()
            except requests.exceptions.RequestException as exc:
                logger.warning(f"WAQI search request failed for {city}: {exc}")
                search_payload = None

            candidates = []
            if search_payload and search_payload.get("data"):
                candidates = search_payload.get("data")

            # If no candidates, try lowercase keyword as fallback
            if not candidates:
                try:
                    resp = requests.get(search_url, params={"keyword": city.lower(), "token": config.WAQI_API_TOKEN}, timeout=10)
                    resp.raise_for_status()
                    search_payload = resp.json()
                    candidates = search_payload.get("data") or []
                except requests.exceptions.RequestException:
                    candidates = []

            # Parse and sort candidates by their reported time (most recent first)
            parsed_candidates = []
            for entry in candidates:
                try:
                    uid = entry.get("uid")
                    station = entry.get("station") or {}
                    stime = (entry.get("time") or {}).get("stime") or (station.get("time") or {}).get("stime")
                    # Parse stime if present
                    if stime:
                        try:
                            stime_dt = datetime.fromisoformat(stime)
                            if stime_dt.tzinfo is None:
                                stime_dt = stime_dt.replace(tzinfo=timezone.utc)
                            stime_dt = stime_dt.astimezone(timezone.utc)
                        except Exception:
                            # last-update string may be like '2026-07-07 16:00:00' (space), try replace
                            try:
                                stime_dt = datetime.fromisoformat(stime.replace(" ", "T"))
                                if stime_dt.tzinfo is None:
                                    stime_dt = stime_dt.replace(tzinfo=timezone.utc)
                                stime_dt = stime_dt.astimezone(timezone.utc)
                            except Exception:
                                stime_dt = None
                    else:
                        stime_dt = None

                    parsed_candidates.append({"uid": uid, "stime": stime_dt})
                except Exception:
                    continue

            # Sort by stime descending (most recent first); keep only those with uid
            parsed_candidates = [c for c in parsed_candidates if c.get("uid")]
            parsed_candidates.sort(key=lambda x: x.get("stime") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

            # Try up to top 10 candidates by recency
            tried_info = []
            freshest_stale_candidate = None
            for candidate in parsed_candidates[:10]:
                uid = candidate["uid"]
                feed_url = f"{WAQI_API_BASE}/@{uid}/?token={config.WAQI_API_TOKEN}"
                try:
                    payload = _fetch_waqi_json(feed_url)
                except requests.exceptions.RequestException as exc:
                    logger.warning(f"WAQI feed request failed for {city} uid={uid}: {exc}")
                    tried_info.append({"uid": uid, "age_hours": None})
                    continue

                reading, reason = _extract_waqi_reading(payload, city, fallback_geo=None)
                if reading is None:
                    logger.warning(f"WAQI data unavailable for {city} uid={uid}: {reason}")
                    tried_info.append({"uid": uid, "age_hours": None})
                    continue

                # Parse recorded_at into a timezone-aware datetime
                try:
                    rec_dt = datetime.fromisoformat(reading["recorded_at"])
                    if rec_dt.tzinfo is None:
                        rec_dt = rec_dt.replace(tzinfo=timezone.utc)
                    rec_dt_utc = rec_dt.astimezone(timezone.utc)
                except Exception:
                    logger.warning(
                        f"Could not parse recorded_at for {city} uid={uid}: {reading.get('recorded_at')!r}"
                    )
                    tried_info.append({"uid": uid, "age_hours": None})
                    continue

                age = datetime.now(timezone.utc) - rec_dt_utc
                age_hours = age.total_seconds() / 3600.0
                tried_info.append({"uid": uid, "age_hours": age_hours})

                # Freshness check: use same 6-hour threshold as before
                if age.total_seconds() > 6 * 3600:
                    if freshest_stale_candidate is None or age_hours < freshest_stale_candidate["age_hours"]:
                        freshest_stale_candidate = {
                            "uid": uid,
                            "age_hours": age_hours,
                            "reading": reading,
                            "rec_dt_utc": rec_dt_utc,
                        }
                    logger.warning(f"Candidate uid={uid} for {city} is stale: {age_hours:.1f}h old; trying next candidate")
                    continue

                # Found a fresh candidate -> proceed with duplicate check and insert (same logic as before)
                cursor.execute(
                    "SELECT recorded_at FROM aqi_readings WHERE city = ? ORDER BY fetched_at DESC LIMIT 1",
                    (city,),
                )
                row = cursor.fetchone()
                if row and row[0]:
                    try:
                        last_rec_dt = datetime.fromisoformat(row[0])
                        if last_rec_dt.tzinfo is None:
                            last_rec_dt = last_rec_dt.replace(tzinfo=timezone.utc)
                        last_rec_dt_utc = last_rec_dt.astimezone(timezone.utc)
                    except Exception:
                        last_rec_dt_utc = None

                    if last_rec_dt_utc is not None and last_rec_dt_utc == rec_dt_utc:
                        logger.info(
                            "No new reading for %s (station last updated %s, skipping duplicate insert)",
                            city,
                            reading["recorded_at"],
                        )
                        city_successful = True
                        break

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
                # No fresh candidate met threshold; use freshest stale candidate if available.
                if freshest_stale_candidate is not None:
                    reading = freshest_stale_candidate["reading"]
                    rec_dt_utc = freshest_stale_candidate["rec_dt_utc"]

                    logger.warning(
                        "Using stale data for %s: freshest available candidate is %.1fh old (no candidate met 6h freshness threshold)",
                        city,
                        freshest_stale_candidate["age_hours"],
                    )

                    # Keep existing dedup-by-recorded_at behavior
                    cursor.execute(
                        "SELECT recorded_at FROM aqi_readings WHERE city = ? ORDER BY fetched_at DESC LIMIT 1",
                        (city,),
                    )
                    row = cursor.fetchone()
                    if row and row[0]:
                        try:
                            last_rec_dt = datetime.fromisoformat(row[0])
                            if last_rec_dt.tzinfo is None:
                                last_rec_dt = last_rec_dt.replace(tzinfo=timezone.utc)
                            last_rec_dt_utc = last_rec_dt.astimezone(timezone.utc)
                        except Exception:
                            last_rec_dt_utc = None

                        if last_rec_dt_utc is not None and last_rec_dt_utc == rec_dt_utc:
                            logger.info(
                                "No new reading for %s (station last updated %s, skipping duplicate insert)",
                                city,
                                reading["recorded_at"],
                            )
                            city_successful = True
                        else:
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
                    else:
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
                else:
                    # Log clear warning with tried candidates info when no valid candidate data was found.
                    num_tried = len(tried_info)
                    ages = [f"{t['age_hours']:.1f}h" if t.get("age_hours") is not None else "unknown" for t in tried_info]
                    logger.warning(
                        "No usable WAQI candidates for %s (tried %d): %s; skipping",
                        city,
                        num_tried,
                        ", ".join(ages) if ages else "none",
                    )

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
