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

await browser.close();
console.log(`${passed} visitor browser groups passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
