import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const catalogue = () => JSON.parse(readFileSync(new URL("media/visitor-scenarios.json", root)));

test("six visitor incidents preserve full choices and the released films", () => {
  const {scenarios} = catalogue();
  const manifest = JSON.parse(readFileSync(new URL("media/manifest.json", root)));
  assert.deepEqual(scenarios.map(s => s.id), [1, 2, 3, 4, 5, 6]);
  for (const s of scenarios) {
    assert.deepEqual(s.choices.map(c => c.letter), ["A", "B", "C", "D"]);
    assert.ok(s.choices.every(c => c.detail.length >= c.title.length));
    assert.ok(s.brief.length >= 3 && s.facts.length >= 5);
    const film = manifest[`vig${s.id}`];
    assert.equal(s.media.src, `media/${film.file}`);
    assert.equal(s.media.sha256, film.sha256);
    assert.equal(s.media.captions, `media/${film.captions.file}`);
    assert.ok(readFileSync(new URL(s.media.captions, root)).includes("WEBVTT"));
  }
});

test("comparisons use the current attributed stage analysis and its provenance", () => {
  const approved = JSON.parse(readFileSync(new URL("production-drafts/ai/chris-oct14-stage-copy.json", root)));
  for (const s of catalogue().scenarios) {
    const expected = approved[s.id];
    assert.equal(s.ai.provider, expected.provider);
    assert.equal(s.ai.decision, expected.decision);
    assert.equal(s.ai.confidence, expected.confidence);
    assert.deepEqual(s.ai.reasoning, expected.reasoning);
    assert.equal(s.ai.conclusion, expected.conclusion);
  }
  const vendor = catalogue().scenarios[3];
  assert.match(vendor.brief.join(" "), /10:42.*10:44.*10:48.*10:49.*10:50/s);
  assert.match(vendor.brief.join(" "), /execution has not been shown/);
  assert.match(vendor.ai.provenance, /edited.*October 13/);
  assert.doesNotMatch(vendor.ai.reasoning.join(" "), /second company|third.company report/);
});

test("visitor catalogue is current and contains no event votes or polling destination", () => {
  execFileSync(process.execPath, ["scripts/export_visitor_scenarios.mjs", "--check"], {cwd: root});
  const content = JSON.stringify(catalogue());
  assert.doesNotMatch(content, /qr\.sli\.do|1549.?939|votes2|judges|DEMO/);
  const water = catalogue().scenarios[4];
  assert.ok(water.facts.some(f => f[1] === "87%"));
  assert.ok(water.facts.some(f => f[1] === "About 6 hours"));
  assert.equal(water.ai.confidence, 97);
});
