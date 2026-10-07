import os
import sqlite3

import config


def get_connection():
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    return sqlite3.connect(config.DB_PATH)


def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS aqi_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                station_name TEXT,
                latitude REAL,
                longitude REAL,
                aqi_value REAL,
                recorded_at TEXT,
                fetched_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS weather_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                temperature REAL,
                wind_speed REAL,
                wind_direction REAL,
                humidity REAL,
                recorded_at TEXT,
                fetched_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS vulnerable_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                site_type TEXT,
                name TEXT,
                latitude REAL,
                longitude REAL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS ingestion_status (
                source TEXT NOT NULL,
                city TEXT NOT NULL,
                last_success_at TEXT,
                last_attempt_at TEXT,
                last_status TEXT,
                last_error TEXT,
                PRIMARY KEY (source, city)
            )
            """
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_aqi_city_fetched ON aqi_readings(city, fetched_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_weather_city_fetched ON weather_readings(city, fetched_at DESC)")
        conn.commit()


def record_ingestion_status(source, city, status, error=None, attempted_at=None, successful_at=None):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO ingestion_status (source, city, last_success_at, last_attempt_at, last_status, last_error)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(source, city) DO UPDATE SET
                last_success_at=COALESCE(excluded.last_success_at, ingestion_status.last_success_at),
                last_attempt_at=excluded.last_attempt_at,
                last_status=excluded.last_status,
                last_error=excluded.last_error
            """,
            (source, city, successful_at, attempted_at, status, error),
        )
        conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {config.DB_PATH}")
