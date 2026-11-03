"""Trace the supplied monochrome logo for shallow solid 3D lettering.

Run once with Python + OpenCV; the room builder consumes the checked-in contours
and needs only Blender. Pixel coordinates and hole hierarchy preserve the exact
script, paw dots and Chinese lettering without substituting a typeface.
"""
import json
from pathlib import Path

import cv2

root = Path(__file__).resolve().parents[1]
source = root / 'assets/lounge/namaoste-logo-reference.png'
gray = cv2.imread(str(source), cv2.IMREAD_GRAYSCALE)
if gray is None:
    raise FileNotFoundError(source)
_, mask = cv2.threshold(gray, 128, 255, cv2.THRESH_BINARY_INV)
contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
shapes = []
for index, contour in enumerate(contours):
    if hierarchy[0][index][3] != -1 or cv2.contourArea(contour) < 3:
        continue
    rings = [cv2.approxPolyDP(contour, .55, True)[:, 0, :].tolist()]
    child = hierarchy[0][index][2]
    while child != -1:
        # Ignore isolated raster specks just as we do for exterior contours.
        # A two-pixel hole at the m's inside edge touches its simplified outline
        # and makes Blender's curve tessellator drop the adjacent front face.
        if cv2.contourArea(contours[child]) >= 3:
            rings.append(cv2.approxPolyDP(contours[child], .55, True)[:, 0, :].tolist())
        child = hierarchy[0][child][0]
    shapes.append(rings)
x, y, width, height = cv2.boundingRect(mask)
data = {'source': source.name, 'bounds': [x, y, width, height], 'shapes': shapes}
target = source.with_name('namaoste-logo-contours.json')
target.write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(shapes)} solid shapes, {sum(len(r) for s in shapes for r in s)} contour vertices -> {target}')
