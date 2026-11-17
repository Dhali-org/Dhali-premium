// End-to-end: the whole unlock flow in headless Chrome against the local
// sandbox (npm run dev), started and stopped by this script.
//
//   npm install && npm run test:e2e
//
// Needs Chrome (CHROME_PATH, default /usr/bin/google-chrome) and internet
// access for the XRPL lookups.

import { spawn } from "node:child_process";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { ROOT } from "../../scripts/release.mjs";

const SITE = "http://localhost:4000/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const pass = (m) => console.log(`  ✔ ${m}`);
const fail = (m) => (failures++, console.log(`  ✖ ${m}`));
const check = (ok, m) => (ok ? pass(m) : fail(m));

// ---------- sandbox ----------
const server = spawn(process.execPath, [join(ROOT, "dev/start.mjs")], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok, no) => {
  server.stdout.on("data", (d) => String(d).includes("Open http") && ok());
  server.on("exit", (code) => no(new Error(`dev server exited (${code}); is port 4000-4003 in use?`)));
});

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1600 });
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  await page.goto(SITE, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.querySelectorAll("dhali-premium iframe").length === 3);
  await sleep(1000);

  // A real mouse click inside the button frame, after the clickjacking guard.
  const clickUnlock = async (i) => {
    const el = (await page.$$("dhali-premium iframe"))[i];
    await el.scrollIntoView();
    await sleep(700);
    const box = await el.boundingBox();
    await page.mouse.click(box.x + 40, box.y + box.height / 2);
  };
  const cardText = (i) =>
    page.$$eval("article.card", (cs, i) => cs[i].innerText.replace(/\s+/g, " "), i);

  console.log("Relay under CSP");
  const firstFrame = await (await page.$("dhali-premium iframe")).contentFrame();
  check(
    (await firstFrame.$eval("#action", (b) => getComputedStyle(b).backgroundColor)) === "rgb(37, 99, 235)",
    "relay.css loads under the relay's CSP"
  );
  check(
    (await firstFrame.$eval("#note", (n) => n.textContent)) === "Paid in XRP from your wallet",
    "names the API's currency under the button"
  );

  console.log("First unlock");
  const popupP = new Promise((r) => browser.once("targetcreated", r));
  await clickUnlock(0);
  const popup = await (await popupP).page();
  await popup.waitForSelector("#connect-btn", { visible: true });
  await popup.waitForFunction(() => /Pay for/.test(document.getElementById("api-name").textContent));
  check(/0\.05 XRP/.test(await popup.$eval("#api-price", (e) => e.textContent)), "wallet shows the API's price");
  await popup.click("#connect-btn");
  await popup.waitForSelector("#open-btn", { visible: true });
  await popup.click("#open-btn");
  await popup.waitForSelector("#claim-btn", { visible: true });
  await popup.$eval("#amount", (e) => (e.value = "0.25"));
  const closed = new Promise((r) => popup.once("close", () => r(true)));
  await popup.click("#claim-btn");
  check(await Promise.race([closed, sleep(5000).then(() => false)]), "wallet hands the claim back and closes");
  await page.waitForSelector("article.card:nth-of-type(1) .risk-report", { timeout: 20000 });
  pass("report replaces the teaser");
  check(!(await cardText(0)).includes("Full report: supply lock"), "teaser removed");

  console.log("Moved element");
  // An unlocked section that is re-inserted must not offer to charge again.
  await page.evaluate(() => {
    const el = document.querySelectorAll("dhali-premium")[0];
    el.parentNode.append(el);
  });
  await sleep(1500);
  const movedFrame = await (await page.$("dhali-premium iframe")).contentFrame();
  check(
    await movedFrame.$eval("body", (b) => b.innerText.includes("Unlocked") && document.getElementById("action").hidden),
    "unlocked section shows no Unlock button after a move"
  );
  check((await cardText(0)).length > 0 && (await page.$("article.card:nth-of-type(1) .risk-report")) !== null, "unlocked content stays");

  // Re-inserting the element (as frameworks do) reloads its iframe in a new
  // window; premium.js must still accept that window's messages.
  await page.evaluate(() => {
    const el = document.querySelectorAll("dhali-premium")[1];
    el.parentNode.append(el);
  });
  await sleep(1500);

  console.log("Second unlock");
  let popups = 0;
  const count = () => popups++;
  browser.on("targetcreated", count);
  await clickUnlock(1);
  await page.waitForSelector("article.card:nth-of-type(2) .risk-report", { timeout: 20000 });
  check(popups === 0, "unlocks with no popup");
  // The wallet didn't open, so the section says where the money came from
  // and how much of the approval is left (0.25 XRP approved above).
  const secondFrame = await (await page.$("article.card:nth-of-type(2) dhali-premium iframe")).contentFrame();
  const spendNote = await secondFrame
    .waitForFunction(() => / left$/.test(document.getElementById("note").textContent), { timeout: 5000 })
    .then(() => secondFrame.$eval("#note", (n) => n.textContent))
    .catch(() => secondFrame.$eval("#note", (n) => n.textContent));
  check(
    /^Paid \d+(\.\d+)? XRP from your saved approval · 0\.1\d* XRP left$/.test(spendNote),
    `says it paid from the saved approval and what's left ("${spendNote}")`
  );

  console.log("JSON + template");
  const unlocked = page.evaluate(
    () => new Promise((r) => document.addEventListener("dhali:unlocked", (e) => r(e.detail.charge), { once: true }))
  );
  await clickUnlock(2);
  await page.waitForSelector("article.card:nth-of-type(3) .quick", { timeout: 20000 });
  check(/Verdict: \S/.test(await cardText(2)), "template filled from JSON");
  check(/^\d+(\.\d+)? XRP$/.test(await unlocked), "dhali:unlocked reports the charge");

  console.log("Failed unlock");
  // The partner's server refuses a bad issuer with a plain-text 400, which the
  // proxy passes through without exposing the compute charge.
  const errors = [];
  await page.exposeFunction("recordError", (m) => errors.push(m));
  await page.evaluate(() => {
    document.addEventListener("dhali:error", (e) => window.recordError(e.detail.message));
    const el = document.createElement("dhali-premium");
    el.setAttribute("api", document.querySelector("dhali-premium").getAttribute("api"));
    el.setAttribute("path", "/reports/not-an-address/RLUSD");
    el.innerHTML = "<p>Teaser for a report that will fail</p>";
    document.body.append(el);
  });
  const failIndex = (await page.$$("dhali-premium iframe")).length - 1;
  const failFrame = await (await page.$$("dhali-premium iframe"))[failIndex].contentFrame();
  await failFrame.waitForFunction(() => document.getElementById("action").textContent.includes("·"), { timeout: 10000 });
  await clickUnlock(failIndex);
  await failFrame.waitForFunction(() => /didn't go through/.test(document.getElementById("note").textContent), { timeout: 10000 });
  const failNote = await failFrame.$eval("#note", (n) => n.textContent);
  check(
    failNote === "This unlock didn't go through (error 400). You weren't charged the unlock price. Try again.",
    `says it failed without blaming anyone or inventing a charge ("${failNote}")`
  );
  check(await failFrame.$eval("#details", (d) => d.hidden), "no details box for a plain-text error");
  check(errors.length === 1, "dhali:error reaches the page");
  check(!(await failFrame.$eval("#action", (b) => b.hidden)), "the Unlock button stays, to try again");

  console.log("Approval runs out");
  let lastNote = "";
  for (let n = 0; n < 3 && !/doesn't cover/.test(lastNote); n++) {
    await page.$eval("input[name=issuer]", (e) => (e.value = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"));
    await page.$eval("input[name=currency]", (e) => (e.value = "RLUSD"));
    await page.click("form button");
    await sleep(1200);
    await clickUnlock(0);
    await sleep(5000);
    const frame = await (await page.$("dhali-premium iframe")).contentFrame();
    lastNote = await frame.$eval("body", (b) => b.innerText).catch(() => "");
  }
  check(/Your saved approval doesn't cover this unlock/.test(lastNote), "says the approval doesn't cover the unlock");
  // Dhali's own message, collapsed until opened.
  const topUp = await (await page.$("dhali-premium iframe")).contentFrame();
  check(
    await topUp.$eval("#details", (d) => !d.hidden && !d.open),
    "Dhali's explanation is there, collapsed"
  );
  check(
    /authorized to pull 0\.\d+ XRP from your payment channel/.test(await topUp.$eval("#details-text", (p) => p.textContent)),
    "the explanation is Dhali's message as written"
  );
  check(/Approve more XRP/.test(lastNote), "top-up button names the API's currency");
  browser.off("targetcreated", count);

  console.log("Change wallet");
  // A real mouse click on section i's Change link, after the clickjacking guard.
  const clickChange = async (i) => {
    const el = (await page.$$("dhali-premium iframe"))[i];
    await el.scrollIntoView();
    await sleep(700);
    const frameBox = await el.boundingBox();
    const r = await (await el.contentFrame()).$eval("#change", (e) => {
      const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.click(frameBox.x + r.x, frameBox.y + r.y);
  };

  // From an unlocked section: Change switches the wallet and never pays.
  const unlockedRelay = await (await page.$$("dhali-premium iframe"))[1].contentFrame();
  check(!(await unlockedRelay.$eval("#wallet", (e) => e.hidden)), "an unlocked section still shows the wallet");
  let unlocks = 0;
  await page.exposeFunction("countUnlock", () => unlocks++);
  await page.evaluate(() => document.addEventListener("dhali:unlocked", () => window.countUnlock()));
  const switchPopupP = new Promise((r) => browser.once("targetcreated", r));
  await clickChange(1);
  const switchPopup = await (await switchPopupP).page();
  await switchPopup.waitForSelector("#claim-btn", { visible: true });
  await switchPopup.click("#claim-btn");
  await unlockedRelay.waitForFunction(() => /Wallet changed/.test(document.getElementById("note").textContent), { timeout: 10000 });
  check(!(await unlockedRelay.$eval("#badge", (e) => e.hidden)), "switching keeps the section unlocked");
  await sleep(1000);
  check(unlocks === 0, "switching the wallet doesn't unlock or charge again");

  // From a section that needs a top-up: Change, then close the wallet.
  const relay = await (await page.$("dhali-premium iframe")).contentFrame();
  check(
    /^Paying from rMockV…\w{4}$/.test(await relay.$eval("#wallet-account", (e) => e.textContent)),
    "shows which wallet the saved approval pays from"
  );
  const changePopupP = new Promise((r) => browser.once("targetcreated", r));
  await clickChange(0);
  const changePopup = await (await changePopupP).page();
  check(!!changePopup, "Change opens the wallet");
  check((await relay.evaluate(() => localStorage.getItem("dhali.premium.claim"))) === null, "Change forgets the saved approval");
  await changePopup.close();
  await relay.waitForFunction(() => /Wallet closed/.test(document.getElementById("note").textContent), { timeout: 5000 });
  check(await relay.$eval("#wallet", (e) => e.hidden), "no wallet line once the approval is forgotten");

  console.log("Isolation and layout");
  check((await page.evaluate(() => Object.keys(localStorage).length)) === 0, "partner page storage holds no claim");
  await page.setViewport({ width: 375, height: 900 });
  await sleep(500);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no horizontal overflow at 375px");
} catch (e) {
  fail(e.stack);
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exitCode = failures ? 1 : 0;
