from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

def handler(event, context):
    timezone = event.get("timezone", "America/Chicago")
    tz = ZoneInfo(timezone)
    now = datetime.now(tz=tz)
    yesterday = now - timedelta(days=1)
    return {"runDate": yesterday.strftime("%Y-%m-%d"), "timezone": timezone}
