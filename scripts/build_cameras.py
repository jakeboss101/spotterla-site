#!/usr/bin/env python3
"""Regenerates the crawlable camera list on index.html and data/cameras.json.
from the iOS app's bundled dataset, so the website and the app always match.

Usage:  python3 -I scripts/build_cameras.py ../SpotterLA/MyApp/CameraSeed.swift

Run it after refreshing CameraSeed.swift in the app repo, then review the generated files.
"""
import html
import json
import re
import sys
from datetime import date
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PAGE = SITE / "index.html"
DATA = SITE / "data" / "cameras.json"

ROW = re.compile(
    r'Camera\(id: "(?P<id>[^"]*)", street: "(?P<street>[^"]*)", '
    r'fromStreet: "(?P<from>[^"]*)", toStreet: "(?P<to>[^"]*)", '
    r'status: "(?P<status>[^"]*)", (?:speedLimit: (?P<limit>\w+), )?'
    r'latitude: (?P<lat>-?[\d.]+), longitude: (?P<lon>-?[\d.]+)\)'
)

# Plain-English labels for LADOT's status values.
STATUS = {
    "Warning Live": ("live", "Live"),
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

    previous = json.loads(DATA.read_text()) if DATA.exists() else []
    previous_dates = {
        camera["id"]: camera.get("addedDate")
        for camera in previous
        if isinstance(camera, dict) and "id" in camera
    }
    has_previous_ids = bool(previous) and all(
        isinstance(camera, dict) and "id" in camera for camera in previous
    )

    rows = []
    map_data = []
    counts = {"live": 0, "construction": 0, "planned": 0}
    for c in cameras:
        kind, label = status_info(c["status"])
        counts[kind] = counts.get(kind, 0) + 1
        lat, lon = float(c["lat"]), float(c["lon"])
        camera_id = c["id"]
        name = html.escape(c["street"])
        from_street = html.escape(c["from"])
        to_street = html.escape(c["to"])
        search = html.escape(
            " ".join((c["street"], c["from"], c["to"])).lower(), quote=True
        )
        limit = int(c["limit"]) if c["limit"] and c["limit"] != "nil" else None
        added_date = previous_dates.get(camera_id)
        if added_date is None and has_previous_ids and camera_id not in previous_dates:
            added_date = date.today().isoformat()

        between = " and ".join(part for part in (from_street, to_street) if part)
        limit_text = f"Limit {limit} mph" if limit is not None else ""
        limit_markup = (
            f'<span class="camera-limit">{limit_text}</span>'
            if limit is not None else ""
        )
        rows.append(
            f'\n            <li class="camera-row" data-camera-id="{html.escape(camera_id, quote=True)}" '
            f'data-status="{kind}" data-search="{search}">'
            f'<button class="camera-select" type="button" data-camera-id="{html.escape(camera_id, quote=True)}">'
            f'<strong>{name}</strong><span>between {between}</span>'
            f'<span class="camera-row-meta"><span class="badge {kind}">{html.escape(label)}</span>'
            f'{limit_markup}</span>'
            f'</button><button class="share-button" type="button" data-camera-id="{html.escape(camera_id, quote=True)}" '
            f'aria-label="Share {name} camera location">Share</button></li>'
        )
        map_data.append({
            "id": camera_id,
            "street": c["street"],
            "fromStreet": c["from"],
            "toStreet": c["to"],
            "status": kind,
            "statusLabel": label,
            "speedLimit": limit,
            "lat": lat,
            "lon": lon,
            "addedDate": added_date,
        })

    page = PAGE.read_text()
    page = replace_between(page, "CAMERAS", "".join(rows) + "\n            ")
    page = replace_between(page, "LIVE", str(counts["live"]))
    page = replace_between(page, "COMING_SOON", str(counts["construction"] + counts["planned"]))
    PAGE.write_text(page)

    DATA.parent.mkdir(exist_ok=True)
    DATA.write_text(json.dumps(map_data, separators=(",", ":")) + "\n")
    print(
        f"Wrote {len(cameras)} cameras ({counts}) to {PAGE.name} "
        f"and {DATA.relative_to(SITE)}"
    )


if __name__ == "__main__":
    main()
