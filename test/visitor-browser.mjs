import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "@playwright/test";

const arg = process.argv.indexOf("--url");
const url = arg >= 0 ? process.argv[arg + 1] : "http://127.0.0.1:8080/play.html";
const outputArg = process.argv.indexOf("--output");
const output = outputArg >= 0 ? process.argv[outputArg + 1] : "test-results/visitor";
const caseArg = process.argv.indexOf("--case");
const selected = caseArg >= 0 ? process.argv[caseArg + 1] : null;
mkdirSync(output, {recursive: true});
const browser = await chromium.launch({channel: "chrome", headless: true});
let passed = 0, failed = 0;
async function check(name, run, options = {}) {
  if (selected && !name.includes(selected)) return;
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, ...options});
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  try {
    await run(page, context);
    console.log(`PASS ${name}`); passed++;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.stack}`); failed++;
    if (await page.locator("video").count()) console.error("Video state:", await page.locator("video").evaluate(v => ({time: v.currentTime, duration: v.duration, ended: v.ended, paused: v.paused, ready: v.readyState, network: v.networkState, error: v.error?.message, seekable: Array.from({length: v.seekable.length}, (_, i) => [v.seekable.start(i), v.seekable.end(i)])})));
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

for (const id of [1, 2, 3, 4, 5, 6]) {
  await check(`film ${id} plays the actual release with captions and native controls, then holds for a decision`, async page => {
    const films = [];
    page.on("request", r => { if (/\.mp4(?:\?|$)/.test(r.url())) films.push(r.url()); });
    await page.goto(`${url}#scenario-${id}`);
    await page.getByRole("button", {name: /Watch the film/}).click();
    await page.locator("video").waitFor();
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return v.currentTime > 0.15 && v.videoWidth === 1920 && v.duration > 40;
    });
    const status = await page.locator("video").evaluate(v => {
      v.pause();
      return {controls: v.controls, inline: v.playsInline, tracks: v.textTracks.length, caption: v.querySelector("track").getAttribute("src"), duration: v.duration};
    });
    assert.equal(status.controls, true);
    assert.equal(status.inline, true);
    assert.equal(status.tracks, 1);
    assert.match(status.caption, /\.vtt$/);
    assert.equal(new Set(films.map(f => f.split("/").at(-1))).size, 1);
    assert.match(films[0], new RegExp(`scenario-0${id}-`));
    await page.locator("video").evaluate(async v => {v.currentTime = v.duration - 0.3; await v.play();});
    await page.waitForFunction(() => document.querySelector("video").ended);
    assert.equal(new URL(page.url()).hash, `#scenario-${id}`);
    assert.equal(await page.getByRole("radio").count(), 4);
    if (id === 4) await page.screenshot({path: `${output}/vendor-film.png`, fullPage: true});
  });
}

await check("failed film leaves the complete incident and choice path usable", async page => {
  await page.route("**/*.mp4", route => route.abort());
  await page.goto(`${url}#scenario-4`);
  await page.getByRole("button", {name: /Watch the film/}).click();
  await page.getByRole("status").filter({hasText: /couldn’t load/}).waitFor();
  await page.getByRole("button", {name: "Read instead", exact: true}).click();
  assert.match(await page.locator("#incident-brief").innerText(), /10:42.*10:44.*10:48.*10:49.*10:50/s);
  await page.locator('input[value="B"]').check();
  await page.getByRole("button", {name: "Compare my call", exact: true}).click();
  await page.getByRole("heading", {name: "Two calls. Same evidence.", exact: true}).waitFor();
  assert.equal(await page.locator("[data-your-choice]").textContent(), "B");
});

await browser.close();
console.log(`${passed} visitor browser groups passed; ${failed} failed.`);
if (failed) process.exitCode = 1;
