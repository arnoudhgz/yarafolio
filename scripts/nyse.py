import zoneinfo
from datetime import datetime, date, timedelta

def nyse_now() -> datetime:
    """Return the current datetime in America/New_York."""
    return datetime.now(zoneinfo.ZoneInfo("America/New_York"))

def nyse_today() -> date:
    """Return the current date in America/New_York."""
    return nyse_now().date()
