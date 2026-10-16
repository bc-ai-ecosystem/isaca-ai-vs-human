import assert from "node:assert/strict";
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const manifest = JSON.parse(readFileSync(new URL("media/manifest.json", root)));

function constant(name, closing) {
  const marker = `const ${name} = `;
  const start = html.indexOf(marker);
  assert.ok(start >= 0, `Missing source content: ${name}`);
  const end = html.indexOf(`\n${closing};`, start);
  assert.ok(end > start, `Missing end of source content: ${name}`);
  const literal = html.slice(start + marker.length, end + closing.length + 1);
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`, {}, {
    timeout: 1000, contextCodeGeneration: {strings: false, wasm: false}
  })));
}

const scenes = constant("SCEN", "]");
const supplied = constant("CHRIS_AI", "}");
const stage = constant("V3_AI", "}");
assert.deepEqual(scenes.map(s => s.id), [1, 2, 3, 4, 5, 6]);
const scenarios = scenes.map(s => {
  const reply = supplied[s.id], analysis = stage[s.id], film = manifest[`vig${s.id}`];
  assert.equal(reply.d, analysis.decision);
  assert.equal(reply.c, analysis.confidence);
  assert.equal(reply.provider, analysis.provider);
  assert.match(reply.d, /^[A-D]$/);
  assert.equal(s.opts.length, 4);
  for (const file of [film.file, film.captions.file, film.poster.file]) {
    assert.ok(file && !file.includes("/") && !file.includes(".."), "Invalid media reference");
  }
  return {
    id: s.id, title: s.title, themes: s.theme, tension: s.tension,
    brief: s.brief, facts: s.facts, question: s.q,
    choices: s.opts.map(([title, detail], i) => ({letter: "ABCD"[i], title, detail})),
    tradeoffs: s.tensionNote, discussion: s.debate,
    ai: {
      provider: reply.provider, decision: reply.d, confidence: reply.c,
      reasoning: analysis.reasoning, conclusion: analysis.conclusion,
      provenance: s.id === 4
        ? "Prepared analysis edited for Chris’s October 13 incident update. The original reply predates this incident revision; no new model call or confidence estimate was made."
        : "Prepared response supplied by Chris, with October 12 edited stage reasoning. Model version not supplied."
    },
    media: {
      src: `media/${film.file}`, poster: `media/${film.poster.file}`,
      captions: `media/${film.captions.file}`, seconds: film.duration_seconds,
      bytes: film.bytes, sha256: film.sha256
    }
  };
});
const sourceHash = createHash("sha256").update(JSON.stringify(scenarios)).digest("hex");
const output = JSON.stringify({version: 1, sourceHash, scenarios}, null, 2) + "\n";
const destination = new URL("media/visitor-scenarios.json", root);
if (process.argv.includes("--check")) {
  assert.equal(readFileSync(destination, "utf8"), output,
    "Visitor content is stale. Run node scripts/export_visitor_scenarios.mjs");
  console.log("Visitor content matches the six source incidents and current released films.");
} else {
  writeFileSync(destination, output);
  console.log("Exported six visitor incidents with current stage analysis and media references.");
}
