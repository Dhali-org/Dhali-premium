# FastAPI

[`require_dhali.py`](require_dhali.py) is a dependency that refuses any request without your header secret. Copy it into your app and attach it to your premium router:

```python
from fastapi import APIRouter, Depends
from require_dhali import require_dhali

premium = APIRouter(prefix="/premium", dependencies=[Depends(require_dhali)])
```

Register `https://your-site.example/premium` as the API's base URL.

| Environment variable | Default |
|---|---|
| `DHALI_SECRET` | none, so it's required |
| `DHALI_SECRET_HEADER` | `x-partner-secret` |

## Run the sample

```sh
cd examples/fastapi
pip install -r requirements.txt
DHALI_SECRET=change-me uvicorn main:app --port 3000
curl -i localhost:3000/premium/articles/1                               # 403
curl -i -H "x-partner-secret: change-me" localhost:3000/premium/articles/1 # 200
```
