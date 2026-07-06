import logging
import os
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config
import database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OVERPASS_API_BASE = "https://overpass-api.de/api/interpreter"
OVERPASS_ENDPOINTS = [
    OVERPASS_API_BASE,
    "https://overpass.kumi.systems/api/interpreter",
]
SEARCH_RADIUS_M = 15000


def _build_overpass_query(lat, lon):
    # Overpass QL query template:
    # [out:json][timeout:25];
    # (
    #   node["amenity"="hospital"](around:15000,lat,lon);
    #   way["amenity"="hospital"](around:15000,lat,lon);
    #   node["amenity"="school"](around:15000,lat,lon);
    #   way["amenity"="school"](around:15000,lat,lon);
    # );
    # out center;
    query = f"""[out:json][timeout:25];
(
  node["amenity"="hospital"](around:{SEARCH_RADIUS_M},{lat},{lon});
  way["amenity"="hospital"](around:{SEARCH_RADIUS_M},{lat},{lon});
  node["amenity"="school"](around:{SEARCH_RADIUS_M},{lat},{lon});
  way["amenity"="school"](around:{SEARCH_RADIUS_M},{lat},{lon});
);
out center;"""
    return query


def _fetch_overpass_json(query):
    headers = {
        "User-Agent": "AirSense-Hackathon-Project/1.0 (educational use)",
        "Accept": "application/json",
    }

    last_error = None
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(1, 3):
            try:
                response = requests.post(
                    endpoint,
                    data={"data": query},
                    headers=headers,
                    timeout=90,
                )
                response.raise_for_status()
                logger.info(f"Overpass request succeeded via {endpoint}")
                return response.json()
            except requests.exceptions.RequestException as exc:
                last_error = exc
                if attempt < 2:
                    logger.warning(
                        f"Retrying {endpoint}, attempt {attempt + 1}/2"
                    )
                    time.sleep(5)
                    continue
                logger.warning(f"Overpass request failed via {endpoint}: {exc}")
                continue

    if last_error is not None:
        raise last_error

    raise RuntimeError("Overpass request failed for all endpoints")


def _extract_vulnerable_sites(payload):
    # Example Overpass response structure (simplified):
    # {
    #   "elements": [
    #     {
    #       "type": "node",
    #       "id": 123456,
    #       "lat": 13.0545,
    #       "lon": 80.1234,
    #       "tags": {
    #         "amenity": "hospital",
    #         "name": "Max Hospital"
    #       }
    #     },
    #     {
    #       "type": "way",
    #       "id": 789012,
    #       "center": {
    #         "lat": 28.6234,
    #         "lon": 77.1234
    #       },
    #       "tags": {
    #         "amenity": "school",
    #         "name": "Delhi Public School"
    #       }
    #     }
    #   ]
    # }
    sites = []
    elements = payload.get("elements", [])

    for element in elements:
        try:
            element_type = element.get("type")
            tags = element.get("tags", {})
            amenity = tags.get("amenity")

            if amenity not in ("hospital", "school"):
                continue

            name = tags.get("name")
            if not name:
                name = f"Unnamed {amenity}"

            if element_type == "node":
                latitude = element.get("lat")
                longitude = element.get("lon")
            elif element_type == "way":
                center = element.get("center", {})
                latitude = center.get("lat")
                longitude = center.get("lon")
            else:
                continue

            if latitude is None or longitude is None:
                continue

            sites.append(
                {
                    "site_type": amenity,
                    "name": name,
                    "latitude": latitude,
                    "longitude": longitude,
                }
            )
        except Exception as e:
            logger.debug(f"Error parsing Overpass element: {e}")
            continue

    return sites


def fetch_and_store_vulnerable_sites():
    """
    Fetch hospitals and schools from OpenStreetMap Overpass API for all cities
    and store in SQLite. Returns a dict with per-city insert counts.
    """
    results = {city: 0 for city in config.CITIES}

    for city_idx, (city, coords) in enumerate(config.CITIES.items()):
        try:
            logger.info(f"Fetching vulnerable sites for {city}...")

            lat = coords["latitude"]
            lon = coords["longitude"]

            query = _build_overpass_query(lat, lon)

            try:
                payload = _fetch_overpass_json(query)
            except requests.exceptions.RequestException as exc:
                logger.warning(f"Overpass request failed for {city}: {exc}")
                continue

            sites = _extract_vulnerable_sites(payload)

            if not sites:
                logger.warning(f"No vulnerable sites found for {city}")
                continue

            conn = database.get_connection()
            cursor = conn.cursor()

            cursor.execute("DELETE FROM vulnerable_sites WHERE city = ?", (city,))

            for site in sites:
                cursor.execute(
                    """
                    INSERT INTO vulnerable_sites
                    (city, site_type, name, latitude, longitude)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        city,
                        site["site_type"],
                        site["name"],
                        site["latitude"],
                        site["longitude"],
                    ),
                )

            conn.commit()
            conn.close()

            results[city] = len(sites)
            logger.info(f"Inserted {len(sites)} vulnerable sites for {city}")

            if city_idx < len(config.CITIES) - 1:
                time.sleep(2)

        except Exception as e:
            logger.warning(f"Error processing {city}: {e}")

    return results


if __name__ == "__main__":
    logger.info("Starting vulnerable sites fetch and store...")
    results = fetch_and_store_vulnerable_sites()
    logger.info("Vulnerable sites fetch complete.")
    for city, count in results.items():
        print(f"{city}: {count} sites inserted")
