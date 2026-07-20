#!/usr/bin/env python3
"""Fetch real Salish Sea coastline from OpenStreetMap (Overpass) and emit hairline SVG paths."""
import json, math, urllib.request, urllib.parse, sys

# Bounding box: lower Vancouver Island + BC mainland (Vancouver) + Puget Sound (Seattle)
S, W, N, E = 47.0, -125.35, 49.45, -122.0

QUERY = f"""
[out:json][timeout:60];
(
  way["natural"="coastline"]({S},{W},{N},{E});
);
out geom;
"""

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

def fetch():
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in ENDPOINTS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "ti-map-builder/1.0"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            last = e
            print(f"  endpoint failed {url}: {e}", file=sys.stderr)
    raise last

# --- projection: equirectangular with longitude cos-correction, north up ---
meanlat = math.radians((S + N) / 2)
kx = math.cos(meanlat)
SCALE = 150.0

def proj(lon, lat):
    x = (lon - W) * kx * SCALE
    y = (N - lat) * SCALE
    return (x, y)

# --- Douglas-Peucker simplification ---
def dp(points, eps):
    if len(points) < 3:
        return points
    dmax, idx = 0.0, 0
    (x1, y1), (x2, y2) = points[0], points[-1]
    for i in range(1, len(points) - 1):
        x0, y0 = points[i]
        num = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
        den = math.hypot(y2 - y1, x2 - x1) or 1e-9
        d = num / den
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = dp(points[:idx + 1], eps)
        right = dp(points[idx:], eps)
        return left[:-1] + right
    return [points[0], points[-1]]

def key(pt):
    return (round(pt[0], 6), round(pt[1], 6))

def stitch(ways):
    """Join coastline ways sharing endpoints into continuous polylines."""
    from collections import defaultdict
    ends = defaultdict(list)
    for i, w in enumerate(ways):
        ends[key(w[0])].append(i)
        ends[key(w[-1])].append(i)
    used = set()
    chains = []
    for start in range(len(ways)):
        if start in used:
            continue
        chain = list(ways[start]); used.add(start)
        # extend forward
        while True:
            k = key(chain[-1])
            nxt = [j for j in ends[k] if j not in used]
            if not nxt:
                break
            j = nxt[0]; wj = ways[j]; used.add(j)
            if key(wj[0]) == k:
                chain += wj[1:]
            else:
                chain += list(reversed(wj))[1:]
        # extend backward
        while True:
            k = key(chain[0])
            prv = [j for j in ends[k] if j not in used]
            if not prv:
                break
            j = prv[0]; wj = ways[j]; used.add(j)
            if key(wj[-1]) == k:
                chain = wj[:-1] + chain
            else:
                chain = list(reversed(wj))[:-1] + chain
        chains.append(chain)
    return chains

def main():
    j = fetch()
    els = [e for e in j.get("elements", []) if e.get("type") == "way" and e.get("geometry")]
    ways = [[(n["lon"], n["lat"]) for n in e["geometry"]] for e in els]
    chains = stitch(ways)
    print(f"  {len(els)} ways stitched into {len(chains)} chains", file=sys.stderr)
    paths = []
    for chain in chains:
        pts = [proj(lon, lat) for lon, lat in chain]
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        diag = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
        if diag < 2.6:  # keep real islands, drop single-node dust
            continue
        pts = dp(pts, 0.18)
        if len(pts) < 2:
            continue
        d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        paths.append((diag, d))
    # sort large→small so big landmasses draw first
    paths.sort(key=lambda t: -t[0])
    dims = {
        "vw_w": round((E - W) * kx * SCALE, 1),
        "vw_h": round((N - S) * SCALE, 1),
    }
    cities = {name: proj(lon, lat) for name, (lat, lon) in {
        "Vancouver": (49.283, -123.121),
        "Victoria":  (48.428, -123.365),
        "Seattle":   (47.606, -122.332),
    }.items()}
    out = {"paths": [d for _, d in paths], "dims": dims,
           "cities": {k: [round(x, 1), round(y, 1)] for k, (x, y) in cities.items()}}
    with open("map_data.json", "w") as f:
        json.dump(out, f)
    print(f"  wrote {len(paths)} paths; viewBox 0 0 {dims['vw_w']} {dims['vw_h']}", file=sys.stderr)

if __name__ == "__main__":
    main()
