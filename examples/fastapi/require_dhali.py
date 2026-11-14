"""FastAPI dependency: only serve requests forwarded by the Dhali proxy.

    app = FastAPI(dependencies=[Depends(require_dhali)])

Set DHALI_SECRET to the header secret you configured in app.dhali.io.
"""

import hmac
import os

from fastapi import HTTPException, Request

DHALI_SECRET_HEADER = os.environ.get("DHALI_SECRET_HEADER", "x-partner-secret")
DHALI_SECRET = os.environ.get("DHALI_SECRET", "")
if not DHALI_SECRET:
    # An empty secret would match requests that send no header at all.
    raise RuntimeError("DHALI_SECRET is not set")


def require_dhali(request: Request) -> None:
    got = request.headers.get(DHALI_SECRET_HEADER, "")
    if not hmac.compare_digest(got.encode(), DHALI_SECRET.encode()):
        raise HTTPException(status_code=403, detail="Forbidden")
