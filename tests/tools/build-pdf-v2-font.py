"""Reproduce the v2 OFL Noto Sans derivative (requires dev-only fontTools).

The legacy subset lacks U+2212. Add a mathematical minus from its own en dash,
using the plus advance/axis; leave the legacy asset byte-for-byte unchanged.
No downloaded font, production dependency or system font is used.
"""
import base64
import copy
import io
import re
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

root = Path(__file__).resolve().parents[2]
source = root / "src/infrastructure/pdf/fonts/noto-sans-base64.ts"
font = TTFont(io.BytesIO(base64.b64decode(re.search(r"[A-Za-z0-9+/=]{100,}", source.read_text()).group())), recalcTimestamp=False)
cmap = font.getBestCmap()
dash = font["glyf"][cmap[0x2013]]
plus = font["glyf"][cmap[0x2B]]
glyph = TTGlyphPen(None)
# Center the horizontal bar on the plus axis and match its side bearings/advance.
scale_x = (plus.xMax - plus.xMin) / (dash.xMax - dash.xMin)
shift_y = (plus.yMin + plus.yMax - dash.yMin - dash.yMax) / 2
dash.draw(TransformPen(glyph, (scale_x, 0, 0, 1, plus.xMin - dash.xMin * scale_x, shift_y)), font["glyf"])
order = font.getGlyphOrder()
font["glyf"]["minus"] = glyph.glyph()
font.setGlyphOrder([*order, "minus"] if "minus" not in order else order)
font["hmtx"].metrics["minus"] = copy.copy(font["hmtx"].metrics[cmap[0x2B]])
for table in font["cmap"].tables:
    if table.isUnicode():
        table.cmap[0x2212] = "minus"
# OFL derivative; do not reuse the upstream family name for the modified font.
for record in font["name"].names:
    if record.nameID in (1, 3, 4, 6):
        record.string = {1: "Zamerok Sans", 3: "ZamerokSans-Regular-v2", 4: "Zamerok Sans Regular", 6: "ZamerokSans-Regular"}[record.nameID].encode(record.getEncoding())
out = io.BytesIO()
font.save(out)
target = root / "src/infrastructure/pdf-v2/fonts/zamerok-sans-base64.ts"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text("// OFL Noto Sans derivative with U+2212. Reproduce: tests/tools/build-pdf-v2-font.py\n"
                  "// Original license: ../../pdf/fonts/OFL.txt\nexport default '" + base64.b64encode(out.getvalue()).decode() + "';\n", encoding="utf-8")
