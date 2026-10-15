import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "@playwright/test";

const arg = process.argv.indexOf("--url");
const url = arg >= 0 ? process.argv[arg + 1] : "http://127.0.0.1:8080/play.html";
const outputArg = process.argv.indexOf("--output");
const output = outputArg >= 0 ? process.argv[outputArg + 1] : "test-results/visitor";
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({channel: "chrome", headless: true});
let passed = 0, failed = 0;
async function check(name, run, options = {}) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, ...options});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  try {
    await run(page, context);
    console.log(`PASS ${name}`); passed++;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack}`); failed++;
    await page.screenshot({path: `${output}/failure-${failed}.png`, fullPage: true});
  } finally { await context.close(); }
}

await check("landing offers all six incidents without downloading films or exposing event controls", async page => {
  const films = [], errors = [];
  page.on("request", r => { if (/\.mp4(?:\?|$)/.test(r.url())) films.push(r.url()); });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("heading", {name: /Four choices/}).waitFor();
  assert.equal(await page.locator(".scenario-link").count(), 6);
  assert.equal(await page.getByRole("link", {name: /Start with the/}).count(), 1);
  assert.equal(await page.locator("video").count(), 0);
  assert.deepEqual(films, []);
  assert.deepEqual(errors, []);
  assert.doesNotMatch(await page.locator("body").innerText(), /Slido|Kahoot|event code|SHOW CONTROL/i);
  await page.screenshot({path: `${output}/landing-desktop.png`, fullPage: true});
});

for (const id of [1, 2, 3, 4, 5, 6]) {
  await check(`incident ${id}: read, commit a decision, and compare the current prepared reasoning`, async page => {
    await page.goto(`${url}#scenario-${id}`);
    await page.getByRole("button", {name: "Read instead", exact: true}).waitFor();
    assert.equal(await page.locator("video").count(), 0);
    assert.equal(await page.locator("[data-ai-choice]").count(), 0);
    const commit = page.getByRole("button", {name: "Compare my call", exact: true});
    assert.equal(await commit.isDisabled(), true);
    await page.getByRole("button", {name: "Read instead", exact: true}).click();
    assert.equal(await page.locator("#incident-brief").getAttribute("open"), "");
    assert.equal(await page.getByRole("radio").count(), 4);
    await page.locator('input[value="A"]').check();
    await commit.click();
    await page.getByRole("heading", {name: "Two calls. Same evidence.", exact: true}).waitFor();
    assert.equal(await page.locator("[data-your-choice]").textContent(), "A");
    assert.equal(await page.locator("[data-ai-choice]").textContent(), ["B", "C", "D", "B", "C", "C"][id - 1]);
    assert.match(await page.locator("#main").innerText(), /prepared|Prepared/);
    assert.match(await page.locator("#main").innerText(), /not a measured probability/);
    assert.equal(await page.getByRole("heading", {name: "What would change your mind?", exact: true}).count(), 1);
    if (id === 4) assert.match(await page.locator("#main").innerText(), /edited.*October 13/);
    if (id === 1) await page.screenshot({path: `${output}/comparison-desktop.png`, fullPage: true});
  });
}

await browser.close();
console.log(`${passed} visitor browser groups passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
