"""Copy the repo's own data for the data room into analytics/data/repo/, unchanged, with a manifest.

    uv run python scripts/copy_repo_data.py     (from analytics/)

The Aug 25 replay's FIRMS SP files and CWFIS hotspots, the replay towns' saved verdicts (data/demo/),
the validation results, VALIDATION.md, TECH-FACTS.md and the fire names. Each file is copied as
committed at HEAD (git's own bytes, whatever line ends the checkout shows), or from the working tree
if it has uncommitted changes. data/repo/manifest.json records, per file, where it came from, the
commit, whether the source was clean in git, its size, SHA-256 and row count.
"""

import csv
import hashlib
import io
import json
import shutil
import subprocess
from datetime import datetime, timezone

from snow import ANALYTICS_DIR, DATA_DIR

ROOT = ANALYTICS_DIR.parent
OUT = DATA_DIR / "repo"
REPLAY = "data/replay/moncton-2025-08-25"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def sources() -> list[tuple[str, str, str]]:
    """(copy path under data/repo/, repo path, what) for every file."""
    replay = json.loads((ROOT / REPLAY / "manifest.json").read_text(encoding="utf-8"))["files"]
    files = [
        (f"replay_2025-08-25/firms/{name}", f"{REPLAY}/firms/{name}",
         f"{replay[f'firms/{name}']['source']}: the Aug 25 replay's NASA detections")
        for name in ("MODIS_SP.csv", "VIIRS_NOAA20_SP.csv", "VIIRS_SNPP_SP.csv")
    ]
    files += [
        ("replay_2025-08-25/hotspots.json", f"{REPLAY}/hotspots.json",
         f"{replay['hotspots.json']['source']} GeoJSON: the Aug 25 replay's Canadian hotspots (rep_date is a report time)"),
        ("replay_2025-08-25/manifest.json", f"{REPLAY}/manifest.json",
         "The Aug 25 replay recording's own manifest: sources, URLs (FIRMS key masked), download times, rows"),
    ]
    for path in sorted((ROOT / "data/demo").glob("*.json")):
        if path.name == "index.json":
            what = "Index of the replay towns and their verdicts, as the web app bundles them"
        else:
            town = json.loads(path.read_text(encoding="utf-8"))
            place = town["location"]
            what = f"The engine's saved replay answer for {place['name']}, {place['province']} at {town['time']}"
        files.append((f"demo/{path.name}", f"data/demo/{path.name}", what))
    files += [
        ("validation/results.json", "data/validation/results.json",
         "The validation table's rows, as engine/scripts/validate.py wrote them"),
        ("VALIDATION.md", "VALIDATION.md", "Validation on reported smoke events and control days: rules, results table, misses"),
        ("TECH-FACTS.md", "TECH-FACTS.md",
         "Written by engine/scripts/tech_facts.py: the engine's merge counts and the refinery point, among others"),
        ("places/fire-names.json", "data/places/fire-names.json", "Public fire names, with the Long Lake fire point"),
    ]
    return files


def rows(copy: str, data: bytes) -> int | None:
    """Data rows where a file has them: CSV rows, GeoJSON features, towns, validation rows, fire names."""
    text = data.decode("utf-8")
    if copy.endswith(".csv"):
        return sum(1 for _ in csv.DictReader(io.StringIO(text)))
    if copy.endswith("hotspots.json"):
        return len(json.loads(text)["features"])
    if copy == "demo/index.json":
        return len(json.loads(text)["towns"])
    if copy == "validation/results.json":
        return len(json.loads(text)["rows"])
    if copy == "places/fire-names.json":
        return len(json.loads(text)["fires"])
    if copy == "VALIDATION.md":
        results = text.split("## Results", 1)[1].split("\n## ", 1)[0]
        table = [line for line in results.splitlines() if line.startswith("|")]
        return len(table) - 2  # header and separator
    return None


def main() -> None:
    commit = git("rev-parse", "HEAD")
    manifest = {
        "about": "Repo files copied unchanged into analytics/data/repo/ by scripts/copy_repo_data.py. "
                 "sha256 and bytes are of the copy; gitBlob is the source's object id at gitCommit.",
        "copiedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": {},
    }
    dirty = []
    for copy, source, what in sources():
        target = OUT / copy
        target.parent.mkdir(parents=True, exist_ok=True)
        clean = git("status", "--porcelain", "--", source) == ""
        if clean:
            data = subprocess.run(["git", "cat-file", "blob", f"HEAD:{source}"], cwd=ROOT, check=True, capture_output=True).stdout
            target.write_bytes(data)
        else:
            dirty.append(source)
            shutil.copyfile(ROOT / source, target)
            data = target.read_bytes()
        entry = {
            "copiedFrom": source,
            "gitCommit": commit,
            "clean": clean,
            "gitBlob": git("rev-parse", f"HEAD:{source}") if clean else None,
            "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        }
        count = rows(copy, data)
        if count is not None:
            entry["rows"] = count
        entry["what"] = what
        manifest["files"][copy] = entry
        print(f"{copy}: {len(data)} bytes" + (f", {count} rows" if count is not None else "") + ("" if clean else ", NOT CLEAN"))
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(manifest['files'])} files at {commit[:7]}; not clean in git: {', '.join(dirty) or 'none'}")


if __name__ == "__main__":
    main()
