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
        conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {config.DB_PATH}")
