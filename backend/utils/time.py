from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

PRIMARY_TIMEZONE = ZoneInfo("Asia/Kolkata")
TIMEZONE_NAME = "Asia/Kolkata"


def now() -> datetime:
    return datetime.now(PRIMARY_TIMEZONE)


def today() -> date:
    return now().date()


def current_time() -> time:
    return now().time()


def iso_now() -> str:
    return now().isoformat(timespec="seconds")


def next_weekday(weekday: int, from_date: date | None = None) -> date:
    origin = from_date or today()
    days_ahead = (weekday - origin.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return origin + timedelta(days=days_ahead)


def resolve_weekday(name: str, from_date: date | None = None) -> date | None:
    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }
    weekday = weekdays.get(name.strip().lower())
    return next_weekday(weekday, from_date) if weekday is not None else None


def trusted_context() -> str:
    current = now()
    return (
        "## CURRENT SYSTEM TIME\n"
        f"Date: {current.date().isoformat()}\n"
        f"Time: {current.strftime('%H:%M:%S')}\n"
        f"Weekday: {current.strftime('%A')}\n"
        f"Timezone: {TIMEZONE_NAME}\n"
        f"ISO timestamp: {current.isoformat(timespec='seconds')}\n"
        "IMPORTANT: This is authoritative application-provided time. "
        "Never invent or infer the current date/time from model knowledge."
    )
