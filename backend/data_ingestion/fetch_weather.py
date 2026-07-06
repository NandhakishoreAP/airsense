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

OPENWEATHER_API_BASE = "https://api.openweathermap.org/data/2.5/weather"


def _fetch_weather_json(url, params):
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def _extract_weather_reading(payload, city_label):
    # Example OpenWeatherMap current weather response structure:
    # {
    #   "dt": 1720173600,
    #   "main": {
    #     "temp": 31.4,
    #     "humidity": 74
    #   },
    #   "wind": {
    #     "speed": 4.8,
    #     "deg": 220
    #   },
    #   "name": "Chennai"
    # }
    try:
        main = payload["main"]
        wind = payload.get("wind", {})
        dt_value = payload["dt"]

        temperature = main["temp"]
        humidity = main["humidity"]
        wind_speed = wind["speed"]
        wind_direction = wind.get("deg")
        recorded_at = datetime.fromtimestamp(dt_value, tz=timezone.utc).isoformat()

        return {
            "city": city_label,
            "temperature": temperature,
            "wind_speed": wind_speed,
            "wind_direction": wind_direction,
            "humidity": humidity,
            "recorded_at": recorded_at,
        }, None
    except KeyError as exc:
        return None, f"missing expected field: {exc}"
    except (TypeError, ValueError) as exc:
        return None, f"invalid weather payload: {exc}"


def fetch_and_store_weather():
    """
    Fetch live weather readings from OpenWeatherMap for all cities and store in SQLite.
    Returns a dict with counts of readings inserted per city.
    """
    results = {city: 0 for city in config.CITIES}

    for city, coords in config.CITIES.items():
        try:
            logger.info(f"Fetching weather data for {city}...")

            params = {
                "lat": coords["latitude"],
                "lon": coords["longitude"],
                "appid": config.OPENWEATHER_API_KEY,
                "units": "metric",
            }

            payload = _fetch_weather_json(OPENWEATHER_API_BASE, params)

            reading, reason = _extract_weather_reading(payload, city)
            if reading is None:
                logger.warning(f"Weather data unavailable for {city}: {reason}")
                continue

            fetched_at = datetime.now(timezone.utc).isoformat()

            conn = database.get_connection()
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO weather_readings
                (city, temperature, wind_speed, wind_direction, humidity, recorded_at, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    reading["city"],
                    reading["temperature"],
                    reading["wind_speed"],
                    reading["wind_direction"],
                    reading["humidity"],
                    reading["recorded_at"],
                    fetched_at,
                ),
            )
            conn.commit()
            conn.close()

            results[city] = 1
            logger.info(f"Inserted 1 weather reading for {city}")

        except requests.exceptions.RequestException as exc:
            logger.warning(f"Weather request failed for {city}: {exc}")
        except Exception as exc:
            logger.warning(f"Error processing {city}: {exc}")

    return results


if __name__ == "__main__":
    logger.info("Starting weather fetch and store...")
    results = fetch_and_store_weather()
    logger.info("Weather fetch complete.")
    for city, count in results.items():
        print(f"{city}: {count} readings inserted")
