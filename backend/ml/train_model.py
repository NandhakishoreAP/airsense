import json
import os
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from xgboost import XGBRegressor

from ml.features import build_all_cities_feature_table


def prepare_training_data(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
    """Prepare features and target for model training.

    - Selects candidate features and keeps those with >=50% non-null.
    - Drops rows with nulls in target or kept features.
    - One-hot encodes `city` and appends those columns.
    Returns (X, y).
    """
    if df is None or df.empty:
        print("No feature data available to prepare.")
        return pd.DataFrame(), pd.Series(dtype=float)

    target = "aqi_value"
    candidate_features = [
        "hour_of_day",
        "day_of_week",
        "is_weekend",
        "temperature",
        "wind_speed",
        "wind_direction",
        "humidity",
        "aqi_lag_1h",
        "aqi_lag_6h",
        "aqi_lag_24h",
        "aqi_rolling_mean_6h",
    ]

    # Compute non-null fraction for each candidate
    keep: List[str] = []
    dropped: List[Tuple[str, float]] = []
    total = len(df)
    for col in candidate_features:
        if col in df.columns:
            non_null_frac = df[col].notna().sum() / float(total)
        else:
            non_null_frac = 0.0

        if non_null_frac >= 0.5:
            keep.append(col)
        else:
            dropped.append((col, non_null_frac))

    print("Feature selection:")
    print("  Kept features:", keep)
    if dropped:
        print("  Dropped features due to <50% availability:")
        for col, frac in dropped:
            print(f"    - {col}: {frac*100:.1f}% non-null")

    # Drop rows with nulls in target or in kept features
    required_cols = [target] + keep
    df_clean = df.dropna(subset=required_cols)

    if df_clean.empty:
        print("No usable rows after dropping nulls for required features.")
        return pd.DataFrame(), pd.Series(dtype=float)

    # One-hot encode city and include as features
    if "city" not in df_clean.columns:
        raise RuntimeError("Feature table missing required column 'city'")

    city_dummies = pd.get_dummies(df_clean["city"], prefix="city")

    # Final feature matrix: kept numeric features (in specified order) + city dummies
    X_numeric = df_clean[keep].copy() if keep else pd.DataFrame(index=df_clean.index)
    X = pd.concat([X_numeric.reset_index(drop=True), city_dummies.reset_index(drop=True)], axis=1)
    y = df_clean[target].reset_index(drop=True)

    # Ensure consistent column ordering: numeric kept features in original order, then sorted city columns
    city_cols = [c for c in X.columns if c.startswith("city_")]
    ordered_cols = keep + sorted(city_cols)
    X = X[ordered_cols]

    return X, y


def train_and_evaluate():
    df_all = build_all_cities_feature_table()
    X, y = prepare_training_data(df_all)

    if X.empty or y.empty or len(X) < 20:
        print("Insufficient data to train model meaningfully (need >=20 rows).")
        print("This will resolve as the scheduler collects more hourly readings over the coming days.")
        return

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train XGBoost regressor with conservative defaults for small datasets
    model = XGBRegressor(max_depth=4, n_estimators=100, learning_rate=0.1, random_state=42, verbosity=0)
    model.fit(X_train, y_train)

    # Predictions
    y_pred = model.predict(X_test)

    # Baseline: use aqi_lag_1h if available among features, otherwise training mean
    if "aqi_lag_1h" in X.columns:
        baseline_method = "aqi_lag_1h"
        # Use column values from X_test; if NaN appear (shouldn't after dropna) fill with training mean
        baseline_preds = X_test["aqi_lag_1h"].fillna(y_train.mean()).to_numpy()
    else:
        baseline_method = "train_mean"
        baseline_preds = np.full(len(y_test), y_train.mean())

    print(f"Baseline method used: {baseline_method}")

    # Evaluate
    model_mae = mean_absolute_error(y_test, y_pred)
    baseline_mae = mean_absolute_error(y_test, baseline_preds)

    improvement = 0.0
    if baseline_mae > 0:
        improvement = (baseline_mae - model_mae) / baseline_mae * 100.0

    print(f"Model MAE: {model_mae:.3f}")
    print(f"Baseline MAE: {baseline_mae:.3f}")
    print(f"Improvement over baseline: {improvement:.1f}%")

    # Persist model and feature list
    ml_dir = os.path.join(os.path.dirname(__file__))
    os.makedirs(ml_dir, exist_ok=True)

    model_path = os.path.join(ml_dir, "model.json")
    feature_path = os.path.join(ml_dir, "model_features.json")

    # Save XGBoost native model
    model.save_model(model_path)

    feature_list = list(X.columns)
    with open(feature_path, "w", encoding="utf-8") as fh:
        json.dump(feature_list, fh, indent=2)

    print(f"Saved model to {model_path}")
    print(f"Saved feature list ({len(feature_list)}) to {feature_path}")


if __name__ == "__main__":
    train_and_evaluate()
