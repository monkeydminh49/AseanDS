"""Import the checked-in AquaEye reference snapshot without executing its code."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
backup = root.parent / "AseanDSE-backup"
source = root / "reference/legacy-index.html"
data = json.JSONDecoder().raw_decode(source.read_text().split("window.__AQUAEYE__ = ", 1)[1])[0]
out = root / "public/data"
out.mkdir(parents=True, exist_ok=True)
(out / "observations.json").write_text(json.dumps(data, ensure_ascii=False))
(out / "provenance.json").write_text(json.dumps({
    "source": str(source.relative_to(root.parent)),
    "upstreamRepository": "https://github.com/monkeydminh49/AseanDS.git",
    "upstreamCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip(),
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "built": data["built"],
    "latestObservation": data["newest"],
    "note": "Local research snapshot; no live satellite ingestion. Grid cells are review areas, not individual ponds. Water change is not a disease diagnosis."
}, indent=2))
for src, dst in [
    ("deck/brief/assets/ca-mau-monitor-basemap.jpg", "assets/ca-mau.jpg"),
    ("deck/brief/assets/ca-mau-monitor-basemap.json", "data/ca-mau-basemap.json"),
    ("deck/codex-flow-ver/assets/asean-country-outlines.geojson", "data/countries.json"),
    ("deck/codex-flow-ver/assets/bac-lieu-sentinel2-cover-rgb.jpg", "assets/ponds.jpg"),
    ("deck/brief/news/latest.json", "data/news.json"),
]:
    shutil.copyfile(backup / src, root / "public" / dst)
print(f"Imported {len(data['provinces'])} provinces; snapshot {data['built']}")
