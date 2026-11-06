#!/usr/bin/env python3
"""Regenerates the camera list on cameras.html (and data/cameras.json for the map)
from the iOS app's bundled dataset, so the website and the app always match.

Usage:  python3 -I scripts/build_cameras.py ../SpotterLA/MyApp/CameraSeed.swift

Run it after Scripts/update_cameras.py in the app repo, then commit and push.
"""
import html
import json
import re
import sys
from urllib.parse import quote
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PAGE = SITE / "cameras.html"
DATA = SITE / "data" / "cameras.json"

ROW = re.compile(
    r'Camera\(id: "(?P<id>[^"]*)", street: "(?P<street>[^"]*)", '
    r'fromStreet: "(?P<from>[^"]*)", toStreet: "(?P<to>[^"]*)", '
    r'status: "(?P<status>[^"]*)", latitude: (?P<lat>-?[\d.]+), longitude: (?P<lon>-?[\d.]+)\)'
)

# Plain-English labels for LADOT's status values.
STATUS = {
    "Warning Live": ("live", "Live: sending warnings"),
    "Under Construction": ("construction", "Under construction"),
    "Planned": ("planned", "Planned"),
}


def status_info(raw):
    if raw in STATUS:
        return STATUS[raw]
    if "live" in raw.lower():
        return ("live", raw)
    return ("planned", raw)


def segment(camera):
    return " to ".join(part for part in (camera["from"], camera["to"]) if part)


def replace_between(text, name, content):
    pattern = re.compile(rf"(<!-- {name}:START -->).*?(<!-- {name}:END -->)", re.S)
    if not pattern.search(text):
        sys.exit(f"Marker {name} not found in {PAGE.name}")
    return pattern.sub(lambda m: m.group(1) + content + m.group(2), text)


def main():
    seed = Path(sys.argv[1]).read_text()
    cameras = [m.groupdict() for m in ROW.finditer(seed)]
    if not cameras:
        sys.exit("No cameras found. Did the CameraSeed.swift format change?")
    cameras.sort(key=lambda c: (c["street"].lower(), segment(c).lower()))

    rows = []
    map_data = []
    counts = {"live": 0, "construction": 0, "planned": 0}
    for c in cameras:
        kind, label = status_info(c["status"])
        counts[kind] = counts.get(kind, 0) + 1
        lat, lon = float(c["lat"]), float(c["lon"])
        name = html.escape(c["street"])
        seg = html.escape(segment(c))
        rows.append(
            f'\n            <li class="camera" data-status="{kind}" data-search="{html.escape((c["street"] + " " + segment(c)).lower())}">'
            f'<div><strong>{name}</strong><span>{seg}</span></div>'
            f'<span class="badge {kind}">{html.escape(label)}</span>'
            f'<span class="camera-links">'
            f'<a href="https://maps.apple.com/?ll={lat:.6f},{lon:.6f}&amp;q={quote(c["street"])}">Apple Maps</a>'
            f'<a href="https://www.google.com/maps/search/?api=1&amp;query={lat:.6f},{lon:.6f}">Google Maps</a>'
            f'</span></li>'
        )
        map_data.append({"street": c["street"], "segment": segment(c), "status": kind,
                         "label": label, "lat": lat, "lon": lon})

    page = PAGE.read_text()
    page = replace_between(page, "CAMERAS", "".join(rows) + "\n            ")
    page = replace_between(page, "TOTAL", str(len(cameras)))
    page = replace_between(page, "LIVE", str(counts["live"]))
    page = replace_between(page, "CONSTRUCTION", str(counts["construction"]))
    page = replace_between(page, "UPDATED", date.today().strftime("%B %-d, %Y"))
    PAGE.write_text(page)

    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps(map_data, separators=(",", ":")) + "\n")
    print(f"Wrote {len(cameras)} cameras ({counts}) to {PAGE.name} and {DATA.relative_to(SITE)}")


if __name__ == "__main__":
    main()
