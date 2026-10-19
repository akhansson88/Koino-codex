#!/usr/bin/env python3
"""Fetch pinned build inputs; never used by the app at runtime."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/bible/search"
LOCK = Path(__file__).with_name("sources.lock.json")


def fingerprint(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record-lock", action="store_true", help="Explicitly approve/record fresh source bytes; review the lock diff.")
    args = parser.parse_args()
    lock = json.loads(LOCK.read_text(encoding="utf-8"))
    for entry in lock["sources"]:
        output = ROOT / entry["path"]
        expected = entry.get("sha256")
        if output.exists() and expected and fingerprint(output) == expected and not args.record_lock:
            print(f"Cached {entry['path']}", flush=True)
            continue
        if not expected and not args.record_lock:
            raise ValueError(f"Unpinned source {entry['path']}; review and record its lock explicitly")
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + ".tmp")
        request = urllib.request.Request(entry["url"], headers={"User-Agent": "Koino-Offline-Search-Builder/1.0"})
        print(f"Fetching {entry['path']}", flush=True)
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as handle:
            while chunk := response.read(1024 * 1024):
                handle.write(chunk)
        actual = fingerprint(temporary)
        if expected and actual != expected and not args.record_lock:
            temporary.unlink()
            raise ValueError(f"Source checksum mismatch for {entry['path']}: {actual}")
        os.replace(temporary, output)
        entry.update(sha256=actual, bytes=output.stat().st_size)
        print(f"Fetched {entry['path']} ({entry['bytes']:,} bytes; {actual})", flush=True)
    if args.record_lock:
        LOCK.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
