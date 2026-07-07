from fastapi import APIRouter, Query, HTTPException
import logging

import config
import database

logger = logging.getLogger(__name__)

router = APIRouter()


def _validate_city(city: str):
    """Validate that city is one of the configured cities."""
    if city not in config.CITIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid city '{city}'. Must be one of: {', '.join(config.CITIES.keys())}",
        )


@router.get("/api/aqi/current")
def get_aqi_current(city: str = Query(..., description="City name")):
    """Get the most recent AQI reading for a city."""
    _validate_city(city)

    conn = database.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT city, station_name, latitude, longitude, aqi_value, recorded_at
            FROM aqi_readings
            WHERE city = ?
            ORDER BY fetched_at DESC
            LIMIT 1
            """,
            (city,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No AQI readings available yet for city '{city}'",
        )

    return {
        "city": row[0],
        "station_name": row[1],
        "latitude": row[2],
        "longitude": row[3],
        "aqi_value": row[4],
        "recorded_at": row[5],
    }


@router.get("/api/weather/current")
def get_weather_current(city: str = Query(..., description="City name")):
    """Get the most recent weather reading for a city."""
    _validate_city(city)

    conn = database.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT city, temperature, wind_speed, wind_direction, humidity, recorded_at
            FROM weather_readings
            WHERE city = ?
            ORDER BY fetched_at DESC
            LIMIT 1
            """,
            (city,),
        )
        row = cursor.fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"No weather readings available yet for city '{city}'",
        )

    return {
        "city": row[0],
        "temperature": row[1],
        "wind_speed": row[2],
        "wind_direction": row[3],
        "humidity": row[4],
        "recorded_at": row[5],
    }


@router.get("/api/vulnerable-sites")
def get_vulnerable_sites(city: str = Query(..., description="City name")):
    """Get all vulnerable sites (hospitals and schools) for a city."""
    _validate_city(city)

    conn = database.get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT site_type, name, latitude, longitude
            FROM vulnerable_sites
            WHERE city = ?
            ORDER BY site_type, name
            """,
            (city,),
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    sites = [
        {
            "site_type": row[0],
            "name": row[1],
            "latitude": row[2],
            "longitude": row[3],
        }
        for row in rows
    ]

    return sites
