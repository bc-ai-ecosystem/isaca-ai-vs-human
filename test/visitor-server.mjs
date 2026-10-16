import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFileSync} from "node:fs";
import {once} from "node:events";
import test from "node:test";

test("preview server supports real film seeking and rejects invalid file requests", async () => {
  const server = spawn(process.execPath, ["scripts/serve.mjs", "--port", "0"], {cwd: new URL("../", import.meta.url), stdio: ["ignore", "pipe", "pipe"]});
  try {
    const [chunk] = await once(server.stdout, "data");
    const url = new URL(chunk.toString().match(/http:\/\/\S+/)[0]);
    const asset = readFileSync(new URL("../media/scenario-01-v7-poster.jpg", import.meta.url));
    const film = new URL("media/scenario-01-v7-poster.jpg", url);
    const response = await fetch(film, {headers: {Range: "bytes=0-15"}});
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 0-15/${asset.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), asset.subarray(0, 16));
    const suffix = await fetch(new URL("visitor.css", url), {headers: {Range: "bytes=-7"}});
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 7);
    const head = await fetch(film, {method: "HEAD"});
    assert.equal(head.headers.get("accept-ranges"), "bytes");
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal((await fetch(film, {headers: {Range: "bytes=999999999-"}})).status, 416);
    assert.equal((await fetch(new URL(".git/config", url))).status, 404);
    assert.equal((await fetch(new URL("missing-file", url))).status, 404);
    assert.equal((await fetch(film, {method: "POST"})).status, 405);
  } finally { server.kill("SIGTERM"); await once(server, "exit"); }
});
