from fastapi import APIRouter, Query, HTTPException
import logging
from datetime import datetime, timezone

import config
import database
from ml.predict import predict_aqi

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

    recorded_at_raw = row[5]
    try:
        recorded_at_dt = datetime.fromisoformat(recorded_at_raw)
        if recorded_at_dt.tzinfo is None:
            recorded_at_dt = recorded_at_dt.replace(tzinfo=timezone.utc)
        recorded_at_utc = recorded_at_dt.astimezone(timezone.utc)
        data_age_hours = round((datetime.now(timezone.utc) - recorded_at_utc).total_seconds() / 3600, 2)
    except Exception:
        data_age_hours = None

    is_stale = data_age_hours is not None and data_age_hours > 6

    return {
        "city": row[0],
        "station_name": row[1],
        "latitude": row[2],
        "longitude": row[3],
        "aqi_value": row[4],
        "recorded_at": row[5],
        "data_age_hours": data_age_hours,
        "is_stale": is_stale,
    }


@router.get("/api/aqi/forecast")
def get_aqi_forecast(
    city: str = Query(..., description="City name"),
    horizon_hours: int = Query(24, description="Forecast horizon in hours"),
):
    """Get an AQI forecast for a city at 24, 48, or 72 hours ahead."""
    _validate_city(city)

    if horizon_hours not in (24, 48, 72):
        raise HTTPException(
            status_code=400,
            detail="Invalid horizon_hours. Must be one of: 24, 48, 72.",
        )

    result = predict_aqi(city, horizon_hours)

    if result.get("predicted_aqi") is None:
        raise HTTPException(
            status_code=404,
            detail=f"No AQI data available yet for city '{city}', so forecast cannot be generated.",
        )

    return result


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
