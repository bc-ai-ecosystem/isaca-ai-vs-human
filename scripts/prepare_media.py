#!/usr/bin/env python3
"""Stage only checksum-verified released films before a static deployment."""

import argparse
import hashlib
import json
import shutil
import tempfile
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, help="Local reviewed master for the selected asset")
parser.add_argument("--asset", help="Catalogue key to stage or check (for example opener or vig1)")
parser.add_argument("--check", action="store_true", help="Verify staged files without downloading")
parser.add_argument(
    "--fallbacks", action="store_true", help="Stage the separately pinned spoken fallbacks"
)
args = parser.parse_args()
catalog_name = "fallbacks.json" if args.fallbacks else "manifest.json"
catalog = json.loads((APP / "media" / catalog_name).read_text())
if args.asset:
    if args.asset not in catalog:
        parser.error(f"Unknown asset: {args.asset}")
    catalog = {args.asset: catalog[args.asset]}
if args.source and len(catalog) != 1:
    parser.error("--source requires --asset when the catalogue contains multiple films")
for asset in catalog.values():
    dest = APP / "media" / asset["file"]
    if Path(asset["file"]).name != asset["file"]:
        raise SystemExit("Invalid release filename")

    def matches(path):
        if not path.is_file() or path.stat().st_size != asset["bytes"]:
            return False
        with path.open("rb") as source:
            return hashlib.file_digest(source, "sha256").hexdigest() == asset["sha256"]

    if matches(dest):
        print(f"Verified {dest.name}")
        continue
    if args.check:
        raise SystemExit(f"Missing or changed release: {dest.name}")
    with tempfile.TemporaryDirectory() as tmp:
        candidate = Path(tmp) / "film.mp4"
        if args.source:
            shutil.copyfile(args.source, candidate)
        else:
            url = f'https://isaca-ai-vs-human.vercel.app/media/{asset["file"]}'
            with urllib.request.urlopen(url, timeout=60) as response, candidate.open("wb") as out:
                shutil.copyfileobj(response, out)
        if not matches(candidate):
            raise SystemExit(f"Checksum or size mismatch: {dest.name}; nothing installed")
        shutil.copyfile(candidate, dest)
    print(f"Staged and verified {dest.name}")
