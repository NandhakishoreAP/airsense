from datetime import datetime, timezone
from typing import Any

from utils.time import now

# Source-specific thresholds: data can be useful while aging, but is never called live after fresh TTL.
THRESHOLDS_SECONDS = {
    "WAQI": (2 * 3600, 6 * 3600),
    "OpenWeatherMap": (2 * 3600, 6 * 3600),
    "ML": (6 * 3600, 24 * 3600),
    "OSM Overpass": (7 * 24 * 3600, 30 * 24 * 3600),
}


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except (TypeError, ValueError):
        return None


def metadata(source: str, measured_at: str | None, fetched_at: str | None) -> dict[str, Any]:
    fetched = parse_timestamp(fetched_at)
    age_seconds = None
    if fetched:
        age_seconds = max(0, int((now().astimezone(timezone.utc) - fetched.astimezone(timezone.utc)).total_seconds()))
    fresh_limit, aging_limit = THRESHOLDS_SECONDS.get(source, (2 * 3600, 6 * 3600))
    if age_seconds is None:
        status = "unavailable"
    elif age_seconds <= fresh_limit:
        status = "fresh"
    elif age_seconds <= aging_limit:
        status = "aging"
    else:
        status = "stale"
    return {
        "source": source,
        "measured_at": measured_at,
        "fetched_at": fetched_at,
        "last_updated": fetched_at,
        "age_seconds": age_seconds,
        "freshness": status,
        "is_fresh": status == "fresh",
    }
