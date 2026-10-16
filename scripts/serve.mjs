import {createServer} from "node:http";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve, extname, sep} from "node:path";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8080;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".mp4": "video/mp4", ".vtt": "text/vtt", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".pdf": "application/pdf", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8"};
const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
  let path;
  try { path = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end(); return; }
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(root + sep) || path.split("/").some(part => part.startsWith("."))) {
    response.writeHead(404).end(); return;
  }
  let info;
  try { info = await stat(file); } catch { response.writeHead(404).end(); return; }
  if (!info.isFile()) { response.writeHead(404).end(); return; }
  const headers = {"Content-Type": types[extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-cache"};
  let start = 0, end = info.size - 1;
  const range = request.headers.range;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
    }
    if (!match || (!match[1] && !match[2]) || start > end || start < 0 || end >= info.size) {
      response.writeHead(416, {...headers, "Content-Range": `bytes */${info.size}`}).end(); return;
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  headers["Content-Length"] = end - start + 1;
  response.writeHead(range ? 206 : 200, headers);
  if (request.method === "HEAD" || !info.size) { response.end(); return; }
  const stream = createReadStream(file, {start, end});
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
});
server.listen(port, "127.0.0.1", () => console.log(`Preview: http://127.0.0.1:${server.address().port}/play.html`));
