#!/usr/bin/env python3
import json
d = json.load(open("map_data.json"))
w, h = d["dims"]["vw_w"], d["dims"]["vw_h"]
coast = " ".join(d["paths"])
c = d["cities"]

# label placement: (dx, dy, anchor) — keep labels over water, inside viewBox
place = {
    "Vancouver": (7, 3.2, "start"),
    "Victoria":  (7, 3.2, "start"),
    "Seattle":   (-7, 3.2, "end"),
}

dots = []
for name, (x, y) in c.items():
    dx, dy, anc = place[name]
    dots.append(f'    <circle class="city" cx="{x}" cy="{y}" r="3"/>')
    dots.append(f'    <text class="label" x="{x+dx:.1f}" y="{y+dy:.1f}" text-anchor="{anc}">{name}</text>')
dots = "\n".join(dots)

svg = f'''<svg class="statement-map" viewBox="0 0 {w} {h}" role="img" aria-label="Map of the Salish Sea region — Vancouver, Victoria and Seattle">
    <path class="coast" d="{coast}"/>
{dots}
  </svg>'''

open("map_snippet.svg", "w").write(svg)
print(f"viewBox 0 0 {w} {h}, {len(svg)} chars")
