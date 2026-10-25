from datetime import datetime, timezone
from fastapi import HTTPException


def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def fail(status, code, detail):
    raise HTTPException(status, dict(code=code, detail=detail))
