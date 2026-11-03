"""Author the continuous woven throw print used by the draped lounge blanket.

Run with ordinary Python (Pillow and numpy). The square image maps once across
the whole blanket; it is not a repeating tile, height map, or geometry pattern.
The supplied sofa reference informs the ivory field, terracotta/teal compass
medallion, angular feather wreath and narrow woven borders.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SIZE = 1536
AA = 2
N = SIZE * AA
IVORY = '#d8ceb4'
RUST = '#b57558'
RUST_DARK = '#a26851'
TEAL = '#729396'
TEAL_DARK = '#597b80'
SAND = '#b7a585'
INK = '#7a796c'
canvas = Image.new('RGB', (N, N), IVORY)
draw = ImageDraw.Draw(canvas)


def polygon(points, fill):
    draw.polygon([(round(x * N), round(y * N)) for x, y in points], fill=fill)


def line(points, fill, width=0.002):
    draw.line([(round(x * N), round(y * N)) for x, y in points], fill=fill,
              width=max(1, round(width * N)), joint='curve')


def radial(points, angle, fill, center=(0.5, 0.5)):
    # Local u runs outward from the center; v runs along the circumference.
    c, s = math.cos(angle), math.sin(angle)
    polygon([(center[0] + u * c - v * s, center[1] + u * s + v * c)
             for u, v in points], fill)


def diamond(cx, cy, rx, ry, fill):
    polygon([(cx, cy-ry), (cx+rx, cy), (cx, cy+ry), (cx-rx, cy)], fill)


# Narrow stitched selvedges. Fringe is modeled separately, outside the image.
for margin, color, width in [(0.027, INK, .003), (.035, SAND, .002),
                              (.054, TEAL_DARK, .002), (.063, SAND, .002)]:
    line([(margin, margin), (1-margin, margin), (1-margin, 1-margin),
          (margin, 1-margin), (margin, margin)], color, width)

# Tiny chevron stitches make an understated woven border, with no tile relief.
for i in range(45):
    t = .062 + i * .0199
    for flip in (False, True):
        y = .044 if not flip else .956
        sign = 1 if not flip else -1
        polygon([(t-.006, y), (t, y-sign*.005), (t+.006, y),
                 (t, y+sign*.005)], INK if i % 3 else TEAL_DARK)
        x = .044 if not flip else .956
        polygon([(x, t-.006), (x-sign*.005, t), (x, t+.006),
                 (x+sign*.005, t)], INK if i % 3 else RUST_DARK)

# Quiet stepped corner emblems connect the frame to the circular composition.
for cx, cy in [(.111,.111),(.889,.111),(.889,.889),(.111,.889)]:
    diamond(cx, cy, .035, .035, SAND)
    diamond(cx, cy, .026, .026, IVORY)
    diamond(cx, cy, .016, .016, TEAL)
    diamond(cx, cy, .006, .006, RUST)

# Thin double sand ring surrounds the generously spaced central compass.
for radius in [.271, .284]:
    draw.ellipse(((.5-radius)*N, (.5-radius)*N, (.5+radius)*N, (.5+radius)*N),
                 outline=SAND, width=round(.003 * N))

# Eight broad stepped spokes: four teal cardinals and four terracotta diagonals.
for i in range(8):
    angle = i * math.pi / 4 - math.pi / 2
    color = TEAL if i % 2 == 0 else RUST
    end = .239 if i % 2 == 0 else .223
    feather = [(.028,-.018),(.072,-.020),(.072,-.034),(.108,-.034),
               (.108,-.050),(.146,-.050),(.146,-.037),(.180,-.037),
               (.180,-.020),(end,0),(.180,.020),(.180,.037),
               (.146,.037),(.146,.050),(.108,.050),(.108,.034),
               (.072,.034),(.072,.020),(.028,.018)]
    radial(feather, angle, color)
    # Central ivory split and smaller stepped vein keep the design textile-like.
    radial([(.051,-.004),(end-.019,-.003),(end-.006,0),(end-.019,.003),(.051,.004)], angle, IVORY)
    for u in [.105,.143,.179]:
        for side in [-1,1]:
            radial([(u-.017,side*.008),(u-.002,side*.024),
                    (u+.014,side*.024),(u-.002,side*.008)], angle, IVORY)
    # Fine zigzag outlines float beside the spoke rather than forming a slab.
    for side in [-1,1]:
        pts=[(.067,side*.036),(.089,side*.036),(.089,side*.050),
             (.119,side*.050),(.119,side*.065),(.153,side*.065),
             (.153,side*.052),(.185,side*.052),(.185,side*.035)]
        c,s=math.cos(angle),math.sin(angle)
        line([(.5+u*c-v*s,.5+u*s+v*c) for u,v in pts], TEAL_DARK if i%2 else RUST_DARK, .0025)

# Wreath of angular feather clusters, similar to the reference's alternating
# rusty bird/lance shapes and blue stepped wings around the large medallion.
for i in range(16):
    angle = i * math.pi / 8 - math.pi / 2
    radial([(.313,-.023),(.336,-.023),(.336,-.037),(.362,-.037),
            (.362,-.024),(.386,-.024),(.419,0),(.386,.024),
            (.362,.024),(.362,.037),(.336,.037),(.336,.023),(.313,.023)], angle, TEAL)
    radial([(.329,-.009),(.354,-.009),(.354,-.021),(.379,-.021),
            (.410,0),(.379,.021),(.354,.021),(.354,.009),(.329,.009)], angle, IVORY)
    radial([(.367,-.009),(.390,-.009),(.421,0),(.390,.009),(.367,.009)], angle, RUST)
    for side in [-1,1]:
        radial([(.305,side*.027),(.322,side*.047),(.348,side*.047),
                (.369,side*.034),(.352,side*.034),(.340,side*.039),
                (.325,side*.039),(.316,side*.027)], angle, TEAL_DARK)
        radial([(.376,side*.034),(.392,side*.042),(.415,side*.025),
                (.431,side*.015),(.408,side*.021),(.389,side*.029)], angle, RUST_DARK)

# Small sun/diamond center with woven spokes.
draw.ellipse((.464*N,.464*N,.536*N,.536*N), fill=IVORY, outline=SAND, width=round(.003*N))
diamond(.5,.5,.026,.026,TEAL_DARK)
diamond(.5,.5,.017,.017,IVORY)
diamond(.5,.5,.009,.009,RUST)

# Antialias motifs first, then add very shallow warp/weft color modulation.
# No baked folds or strong lighting: Blender supplies the drape and illumination.
canvas = canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
canvas = canvas.filter(ImageFilter.GaussianBlur(.20))
rgb = np.asarray(canvas, dtype=np.float32)
rng = np.random.default_rng(903)
yy, xx = np.mgrid[0:SIZE, 0:SIZE]
warp = .85 * np.sin(xx * math.pi) + .65 * np.cos(xx * math.pi / 2)
weft = .85 * np.sin(yy * math.pi / 2 + (xx % 2) * math.pi)
grain = rng.normal(0, 1.3, (SIZE, SIZE))
fibers_x = rng.normal(0, .45, SIZE)[None, :]
fibers_y = rng.normal(0, .45, SIZE)[:, None]
tone = (warp + weft + grain + fibers_x + fibers_y)[..., None]
rgb = np.clip(rgb + tone, 0, 255).astype(np.uint8)
output = ROOT / 'assets' / 'lounge' / 'blanket-woven.png'
output.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(rgb).save(output, optimize=True)
print(output)
