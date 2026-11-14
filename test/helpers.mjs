export const listen = (server) =>
  new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${server.address().port}`)));

export const close = (server) => new Promise((ok) => server.close(ok));

export const claim = (authorised, channel = "ch-test") =>
  Buffer.from(
    JSON.stringify({ version: "2", channel_id: channel, authorized_to_claim: String(authorised), signature: "00" })
  ).toString("base64");
