# Express

[`require-dhali.js`](require-dhali.js) is middleware that refuses any request without your header secret. Copy it into your app and put it in front of your premium routes:

```js
import { requireDhali } from "./require-dhali.js";

app.use("/premium", requireDhali());
app.get("/premium/articles/:id", (req, res) => res.send(renderArticle(req.params.id)));
```

Register `https://your-site.example/premium` as the API's base URL, and use `path="/articles/42"` in the element.

| Option | Default |
|---|---|
| `header` | `x-partner-secret` |
| `secret` | `process.env.DHALI_SECRET` |

## Run the sample

```sh
cd examples/express
npm install
DHALI_SECRET=change-me node server.js
curl -i localhost:3000/premium/articles/1                               # 403
curl -i -H "x-partner-secret: change-me" localhost:3000/premium/articles/1 # 200
```
