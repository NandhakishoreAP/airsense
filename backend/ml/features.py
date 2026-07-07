import logging
from datetime import timezone

import numpy as np
import pandas as pd

import config
import database

logger = logging.getLogger(__name__)


def _read_table_df(table: str, city: str) -> pd.DataFrame:
    """Read all rows from a given table for `city`, return a DataFrame.

    The returned DataFrame will have `recorded_at` parsed as timezone-aware UTC datetimes.
    """
    sql = f"SELECT * FROM {table} WHERE city = ? ORDER BY recorded_at ASC"
    conn = database.get_connection()
    try:
        df = pd.read_sql_query(sql, conn, params=(city,))
    finally:
        conn.close()

    if df.empty:
        return df

    # Ensure recorded_at is a timezone-aware datetime in UTC
    if "recorded_at" in df.columns:
        df["recorded_at"] = pd.to_datetime(df["recorded_at"], utc=True, errors="coerce")

    return df


def build_feature_table(city: str) -> pd.DataFrame:
    """Build a feature table for `city` by merging AQI and weather readings.

    Behavior notes:
    - Uses `merge_asof` to join AQI rows (left) to the nearest weather row (right)
      within a 30-minute tolerance.
    - Lag features are produced by matching the AQI time series to itself offset
      by the desired lag (1h, 6h, 24h) using an asof-style join. If not enough
      history exists for a given row (e.g. project just started), those lag
      features will be NaN — this is expected and will resolve naturally as
      the scheduler accumulates more data over time.
    """
    if city not in config.CITIES:
        raise ValueError(f"Unknown city '{city}'. Must be one of: {', '.join(config.CITIES.keys())}")

    # Read source tables
    aqi_df = _read_table_df("aqi_readings", city)
    weather_df = _read_table_df("weather_readings", city)

    if aqi_df.empty:
        # No AQI data yet — return an empty DataFrame with expected columns
        logger.info("No AQI readings for %s; returning empty feature table.", city)
        return pd.DataFrame()

    # Prepare DataFrames: ensure sorting by recorded_at
    aqi_df = aqi_df.sort_values("recorded_at").reset_index(drop=True)
    if not weather_df.empty:
        weather_df = weather_df.sort_values("recorded_at").reset_index(drop=True)

    # Merge AQI (left) with nearest weather (right) within 30 minutes
    tolerance = pd.Timedelta(minutes=30)
    if not weather_df.empty:
        merged = pd.merge_asof(
            aqi_df.sort_values("recorded_at"),
            weather_df.sort_values("recorded_at"),
            on="recorded_at",
            direction="nearest",
            tolerance=tolerance,
            suffixes=("_aqi", "_weather"),
        )
    else:
        # No weather data yet — keep AQI rows and add empty weather columns
        merged = aqi_df.copy()
        for col in ["temperature", "wind_speed", "wind_direction", "humidity"]:
            if col not in merged.columns:
                merged[col] = np.nan

    # Normalize: ensure there is a `city` column with the city name
    merged["city"] = city

    # Make sure recorded_at is datetime64[ns, UTC]
    merged["recorded_at"] = pd.to_datetime(merged["recorded_at"], utc=True)

    # Feature: hour_of_day, day_of_week, is_weekend
    merged["hour_of_day"] = merged["recorded_at"].dt.hour
    merged["day_of_week"] = merged["recorded_at"].dt.dayofweek
    merged["is_weekend"] = merged["day_of_week"].isin([5, 6])

    # Helper: source series for AQI values by timestamp (drop duplicates on timestamp)
    aqi_series = merged[["recorded_at", "aqi_value"]].drop_duplicates("recorded_at").sort_values("recorded_at").reset_index(drop=True)

    # Compute lag features by asof-joining the AQI series to itself shifted forward
    # (so a row at time t will pick up the value that was recorded ~lag_hours earlier).
    for hours in (1, 6, 24):
        right = aqi_series.copy()
        right["recorded_at"] = right["recorded_at"] + pd.Timedelta(hours=hours)
        right = right.rename(columns={"aqi_value": f"aqi_lag_{hours}h"})

        merged = pd.merge_asof(
            merged.sort_values("recorded_at"),
            right.sort_values("recorded_at"),
            on="recorded_at",
            direction="nearest",
            tolerance=tolerance,
        )

    # Compute trailing 6-hour rolling mean of AQI (time-based window)
    # Use the recorded_at as DatetimeIndex for a time-aware rolling window.
    rm = (
        merged.set_index("recorded_at")["aqi_value"]
        .rolling("6h", closed="both")
        .mean()
        .rename("aqi_rolling_mean_6h")
    )

    merged = merged.set_index("recorded_at")
    merged = merged.join(rm)
    merged = merged.reset_index()

    # Note: When the dataset is small (e.g., project just started), lag and rolling
    # features will naturally be NaN for many rows. This is expected and will
    # resolve as the scheduler collects more historical data over time.

    return merged


def build_all_cities_feature_table() -> pd.DataFrame:
    """Build feature tables for all configured cities and concatenate them.

    The returned DataFrame includes a `city` column preserved for downstream
    model training.
    """
    dfs = []
    for city in config.CITIES.keys():
        try:
            df = build_feature_table(city)
        except Exception as e:
            logger.exception("Failed to build features for %s: %s", city, e)
            df = pd.DataFrame()

        if not df.empty:
            dfs.append(df)

    if not dfs:
        return pd.DataFrame()

    combined = pd.concat(dfs, ignore_index=True)
    return combined


if __name__ == "__main__":
    # Quick local check: build features for all cities and print a brief summary
    df_all = build_all_cities_feature_table()
    if df_all.empty:
        print("No feature rows produced (likely no AQI data yet).")
    else:
        print("Feature table shape:", df_all.shape)
        print("Columns:", list(df_all.columns))
        print(df_all.head())
