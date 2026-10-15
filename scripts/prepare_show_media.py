"""Restore or verify the pinned cinematic alternatives and original manual AV cues."""

import argparse
import hashlib
import json
import re
import urllib.request
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--origin", default="https://isaca-ai-vs-human.vercel.app")
    args = parser.parse_args()
    media = Path(__file__).resolve().parents[1] / "media"
    cinema = json.loads((media / "cinematic-alternatives.json").read_text())
    sound = json.loads((media / "av-soundbank.json").read_text())
    backups = (
        json.loads((media / "scenario-backups.json").read_text())
        if (media / "scenario-backups.json").exists()
        else {}
    )
    assets = (
        list(cinema["assets"].values())
        + list(backups.values())
        + [a for cue in sound["cues"] for a in cue["assets"].values()]
    )
    for asset in assets:
        name = asset["file"]
        if not re.fullmatch(r"[a-z0-9-]+\.(mp4|mp3|wav)", name) or not re.fullmatch(
            r"[a-f0-9]{64}", asset["sha256"]
        ):
            raise SystemExit("Invalid pinned show-media catalogue")
        target = media / name
        if not target.exists():
            if args.check:
                raise SystemExit(f"Missing {name}; restore pinned assets before packaging")
            with urllib.request.urlopen(
                args.origin.rstrip("/") + "/media/" + name, timeout=120
            ) as source:
                data = source.read()
            if len(data) != asset["bytes"] or hashlib.sha256(data).hexdigest() != asset["sha256"]:
                raise SystemExit(f"Remote integrity check failed for {name}; nothing saved")
            target.write_bytes(data)
        with target.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        if target.stat().st_size != asset["bytes"] or digest != asset["sha256"]:
            raise SystemExit(f"Pinned integrity check failed for {name}")
        print(f"Verified {name}")


if __name__ == "__main__":
    main()
