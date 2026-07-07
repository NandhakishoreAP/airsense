import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from xgboost import XGBRegressor

import config
import database
from ml.features import build_feature_table

logger = logging.getLogger(__name__)


def load_model_if_available() -> Tuple[Optional[XGBRegressor], Optional[List[str]]]:
    """Load model and feature list if both files exist, else return (None, None)."""
    base = os.path.dirname(__file__)
    model_path = os.path.join(base, "model.json")
    features_path = os.path.join(base, "model_features.json")

    if not (os.path.exists(model_path) and os.path.exists(features_path)):
        return None, None

    try:
        model = XGBRegressor()
        model.load_model(model_path)
        with open(features_path, "r", encoding="utf-8") as fh:
            feature_list = json.load(fh)
        return model, feature_list
    except Exception as e:
        logger.exception("Failed to load model or features: %s", e)
        return None, None


def _most_recent_values_for_city(city: str) -> Optional[pd.Series]:
    """Return the most recent feature row produced by build_feature_table(city), or None."""
    df = build_feature_table(city)
    if df is None or df.empty:
        return None
    # build_feature_table returns rows ordered by recorded_at ascending
    return df.iloc[-1]


def predict_aqi(city: str, horizon_hours: int) -> Dict[str, Any]:
    """Predict AQI for `city` at future horizon_hours (24/48/72).

    If a trained model exists, use it; otherwise fall back to naive last-value.
    """
    if horizon_hours not in (24, 48, 72):
        raise ValueError("horizon_hours must be one of 24, 48, 72")

    model, feature_list = load_model_if_available()

    if model is None or feature_list is None:
        # naive fallback: return most recent aqi_value from DB
        conn = database.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT aqi_value, recorded_at FROM aqi_readings WHERE city = ? ORDER BY fetched_at DESC LIMIT 1",
                (city,),
            )
            row = cursor.fetchone()
        finally:
            conn.close()

        if not row:
            logger.info("No AQI data available for %s — returning no_data_available", city)
            return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": None, "method": "no_data_available"}

        value = row[0]
        return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": float(value), "method": "naive_fallback_no_model_yet"}

    # Model is available — construct a feature row matching feature_list
    future_dt = datetime.now(timezone.utc) + timedelta(hours=horizon_hours)
    hour_of_day = future_dt.hour
    day_of_week = future_dt.weekday()
    is_weekend = day_of_week in (5, 6)

    recent = _most_recent_values_for_city(city)
    if recent is None:
        # No historical features; fallback to naive behavior
        logger.info("Model exists but no feature rows for %s; falling back to naive last-value if available", city)
        conn = database.get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT aqi_value, recorded_at FROM aqi_readings WHERE city = ? ORDER BY fetched_at DESC LIMIT 1",
                (city,),
            )
            row = cursor.fetchone()
        finally:
            conn.close()

        if not row:
            return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": None, "method": "no_data_available"}
        return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": float(row[0]), "method": "naive_fallback_no_model_yet"}

    # Build dictionary of features
    feat: Dict[str, Any] = {}
    # numeric/time features we know how to fill
    proxies = {
        "hour_of_day": hour_of_day,
        "day_of_week": day_of_week,
        "is_weekend": bool(is_weekend),
        # For lag/rolling features use the most recent available value as proxy
        "aqi_lag_1h": recent.get("aqi_lag_1h") if "aqi_lag_1h" in recent.index else None,
        "aqi_lag_6h": recent.get("aqi_lag_6h") if "aqi_lag_6h" in recent.index else None,
        "aqi_lag_24h": recent.get("aqi_lag_24h") if "aqi_lag_24h" in recent.index else None,
        "aqi_rolling_mean_6h": recent.get("aqi_rolling_mean_6h") if "aqi_rolling_mean_6h" in recent.index else None,
        "temperature": recent.get("temperature") if "temperature" in recent.index else None,
        "wind_speed": recent.get("wind_speed") if "wind_speed" in recent.index else None,
        "wind_direction": recent.get("wind_direction") if "wind_direction" in recent.index else None,
        "humidity": recent.get("humidity") if "humidity" in recent.index else None,
    }

    # Fill features according to saved feature_list
    for col in feature_list:
        if col in proxies:
            val = proxies[col]
            # If pandas NA/NaN, convert to None
            if pd.isna(val):
                val = None
            feat[col] = val
        elif col.startswith("city_"):
            # fill city one-hot: set matching city column to 1 else 0
            expected = f"city_{city}"
            feat[col] = 1 if col == expected else 0
        else:
            # unknown feature — set to 0 as safe default
            feat[col] = 0

    # If any features are None, fill with reasonable defaults: 0 for numeric, False for bool
    for k, v in list(feat.items()):
        if v is None:
            feat[k] = 0

    X_row = pd.DataFrame([feat], columns=feature_list)

    try:
        pred = model.predict(X_row)[0]
        return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": float(pred), "method": "xgboost_model"}
    except Exception as e:
        logger.exception("Model prediction failed: %s", e)
        return {"city": city, "horizon_hours": horizon_hours, "predicted_aqi": None, "method": "prediction_error"}


if __name__ == "__main__":
    for city in config.CITIES.keys():
        out = predict_aqi(city, 24)
        print(out)
