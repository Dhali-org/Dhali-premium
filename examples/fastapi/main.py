"""A minimal premium endpoint.

Register https://<host>/premium as the API's base URL in app.dhali.io.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import HTMLResponse

from require_dhali import require_dhali

app = FastAPI()
premium = APIRouter(prefix="/premium", dependencies=[Depends(require_dhali)])


@premium.get("/articles/{article_id}", response_class=HTMLResponse)
def article(article_id: int) -> str:
    # An HTML fragment: <dhali-premium> inserts it into your page.
    return f"<article><h3>Article {article_id}</h3><p>The full text…</p></article>"


@premium.get("/prices/{symbol}")
def price(symbol: str) -> dict:
    # format="json": the page fills a <template> or handles dhali:unlocked.
    return {"symbol": symbol, "price": 2.31, "updated": datetime.now(timezone.utc).isoformat()}


app.include_router(premium)
