"""Fetch the pinned prior cut used by the chat replacement/restore test."""
import hashlib
import json
import urllib.request
from pathlib import Path

app = Path(__file__).resolve().parents[1]
fixture = json.loads((app / "test/media-fixture.json").read_text())
name = fixture["file"]
if Path(name).name != name:
    raise SystemExit("Invalid fixture filename")
target = app / "media" / name
data = target.read_bytes() if target.exists() else urllib.request.urlopen(
    "https://isaca-ai-vs-human.vercel.app/media/" + name, timeout=120
).read()
if len(data) != fixture["bytes"] or hashlib.sha256(data).hexdigest() != fixture["sha256"]:
    raise SystemExit("Prior-cut fixture integrity check failed; nothing installed")
if not target.exists():
    target.write_bytes(data)
print("Verified " + name)
