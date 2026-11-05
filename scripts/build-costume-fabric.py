"""Author the real-time costume fabric kit in Blender 5.2.

Run from the repository root with blender --background --factory-startup
--python scripts/build-costume-fabric.py. The original cat sources are only
linked as a fitting reference. Exported coordinates are +Y up, +Z forward;
UVs are meters, with eight fabric tiles per meter in the game material.
"""
import bpy
import bmesh
import json
import math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/costumes'
TEXTURES = ROOT / 'public/textures/costumes'
GENERATED = ROOT / 'src/generated'
for directory in (SOURCE, TEXTURES, GENERATED):
    directory.mkdir(parents=True, exist_ok=True)


def v(p):
    return Vector((p[0], -p[2], p[1]))


def game(p):
    return (p[0], p[2], -p[1])


scene = bpy.data.scenes.new('Costume fabric workshop')
bpy.context.window.scene = scene
scene.world = bpy.data.worlds.new('Fabric studio')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.18, .21, .26, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .35
scene['game_coordinates'] = '+Y up / +Z forward'
scene['texture_tiles_per_meter'] = 8


def write_data_image(name, values):
    image = bpy.data.images.new(name, width=512, height=512, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((512, 512, 4), dtype=np.float32)
    rgba[:, :, :3] = values if values.ndim == 3 else values[:, :, None]
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = str(TEXTURES / name)
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image


# A periodic plain weave. Each tile spans 12.5 cm with sixteen threads in each
# direction. The alternating lifted yarns, twisted fibers and tiny variation
# produce a textile normal, without painting checker colors into the cloth.
yy, xx = np.mgrid[0:512, 0:512].astype(np.float32) / 512
u, w = xx * 16, yy * 16
warp = np.maximum(0, np.cos(2 * math.pi * u)) ** .65
weft = np.maximum(0, np.cos(2 * math.pi * w)) ** .65
cross = np.cos(math.pi * u) * np.cos(math.pi * w)
height = np.maximum(warp * (.75 + .20 * cross), weft * (.75 - .20 * cross))
height += .035 * np.sin(2 * math.pi * (xx * 128 + yy * 48))
height += .018 * np.cos(2 * math.pi * (xx * 73 - yy * 29))
dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 512 * .00018 / .125
dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 512 * .00018 / .125
normals = np.stack((-dx, -dy, np.ones_like(dx)), axis=-1)
normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
normal_image = write_data_image('fabric-normal.png', normals * .5 + .5)
roughness_image = write_data_image('fabric-roughness.png', np.clip(.88 + .095 * (1 - height), .82, .98))


def material(name, color, roughness, sheen):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Sheen Weight'].default_value = sheen
    bsdf.inputs['Sheen Roughness'].default_value = .8
    uv = nodes.new('ShaderNodeTexCoord')
    scale = nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs[3].default_value = 8
    links.new(uv.outputs['UV'], scale.inputs[0])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = normal_image
    links.new(scale.outputs['Vector'], tex.inputs['Vector'])
    normal = nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .55
    links.new(tex.outputs['Color'], normal.inputs['Color'])
    links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    rough = nodes.new('ShaderNodeTexImage')
    rough.image = roughness_image
    links.new(scale.outputs['Vector'], rough.inputs['Vector'])
    links.new(rough.outputs['Color'], bsdf.inputs['Roughness'])
    return mat


fabric = material('Woven wool | game tint is vertex color', (.43, .033, .052), .91, .32)
trim = material('Soft stitched fleece edging', (.92, .85, .68), .98, .5)
pieces = {'cape': [], 'scarf': []}


def surface(name, garment, role, positions, uvs, faces, thickness=0):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([v(p) for p in positions], [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(ob)
    mesh.materials.append(fabric if role == 'fabric' else trim)
    uv = mesh.uv_layers.new(name='Fabric meters')
    for face in mesh.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            uv.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
    # Close cylindrical surfaces before Solidify while keeping loop UV seams.
    # Duplicate seam vertices otherwise produce an internal wall in the band.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    if thickness:
        mod = ob.modifiers.new('Sewn fabric thickness', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = -.5
        mod.use_even_offset = True
    ob['garment'] = garment
    ob['role'] = role
    pieces[garment].append(ob)
    return ob


def grid(name, garment, role, rows, columns, point, uv, thickness=0):
    positions, coords, faces = [], [], []
    for row in range(rows + 1):
        for col in range(columns + 1):
            positions.append(point(row / rows, col / columns))
            coords.append(uv(row / rows, col / columns))
            if row and col:
                n = row * (columns + 1) + col
                b = n - columns - 1
                faces.append((b - 1, n - 1, n, b))
    return surface(name, garment, role, positions, coords, faces, thickness)


def piping(name, garment, points, radius, role='trim', sides=6):
    positions, uvs, faces, length = [], [], [], 0.
    for row, p in enumerate(points):
        p = Vector(p)
        before, after = Vector(points[max(0, row - 1)]), Vector(points[min(len(points) - 1, row + 1)])
        tangent = (after - before).normalized()
        normal = tangent.cross(Vector((0, 0, 1)))
        if normal.length < .1:
            normal = tangent.cross(Vector((0, 1, 0)))
        normal.normalize()
        bitangent = tangent.cross(normal).normalized()
        if row:
            length += (p - Vector(points[row - 1])).length
        for col in range(sides + 1):
            a = col / sides * math.tau
            positions.append(p + radius * (normal * math.cos(a) + bitangent * math.sin(a)))
            uvs.append((col / sides * math.tau * radius, length))
            if row and col:
                n = row * (sides + 1) + col
                b = n - sides - 1
                faces.append((b - 1, b, n, n - 1))
    return surface(name, garment, role, positions, uvs, faces)


def cape_point(t, s):
    angle = -.15 + s * (math.pi + .3)
    # Shoulder tension holds the top close; gravity opens folds toward the hem.
    fold = (.002 + .012 * t * t) * math.sin(s * math.pi * 14 + t * .7)
    fold += .003 * math.sin(t * math.pi * 3 + s * 7) * math.sin(s * math.pi)
    rx = .352 + .065 * t + fold
    ry = .393 - .014 * t + fold * .65
    x = math.cos(angle) * rx
    y = .69 + math.sin(angle) * ry - .007 * t * t * (abs(math.cos(angle)) ** 2)
    # A scooped neckline goes behind the head at the spine, while the low
    # shoulder corners remain forward. A straight edge cuts through the neck.
    start_z = .40 - .23 * max(0., math.sin(angle)) ** 2
    z = start_z * (1 - t) - .38 * t + .010 * t * t * math.cos(s * math.pi * 6)
    return (x, y, z)


grid('Cape | tailored wool with gravity folds', 'cape', 'fabric', 16, 40,
     cape_point, lambda t, s: (s * 1.32, t * .78), .009)
piping('Cape | rolled rear hem', 'cape', [cape_point(1, i / 40) for i in range(41)], .018)
for edge in (0, 1):
    piping('Cape | bound side seam ' + str(edge), 'cape', [cape_point(i / 16, edge) for i in range(17)], .015)
# A subtle sewn seam inside each edge, giving thickness without chunky beads.
for edge in (.028, .972):
    piping('Cape | inset stitch ridge ' + str(edge), 'cape', [cape_point(i / 16, edge) for i in range(17)], .0023, 'fabric', 4)
piping('Cape | neckline binding', 'cape', [cape_point(0, i / 40) for i in range(41)], .013)

# Link the native cat read-only. The collar is fitted to skin, not guard hairs.
with bpy.data.libraries.load(str(ROOT / 'assets/choco/choco.blend'), link=True) as (available, loaded):
    loaded.collections = []
    loaded.scenes = ['Choco • chocolate & cream']
reference_scene = loaded.scenes[0]
reference = bpy.data.objects.new('Choco | linked body fitting reference', None)
reference.instance_type = 'COLLECTION'
reference.instance_collection = reference_scene.collection
scene.collection.objects.link(reference)
reference.hide_render = True
reference['note'] = 'Linked untouched native cat. Toggle to inspect the exact body envelope.'
skin = next(ob for ob in reference_scene.objects if ob.name == 'Choco_ContinuousSkin')
body_tree = BVHTree.FromPolygons([skin.matrix_world @ vertex.co for vertex in skin.data.vertices],
                               [tuple(face.vertices) for face in skin.data.polygons])


def scarf_point(t, s):
    a = s * math.tau
    fold = .003 * math.sin(a * 9 + t * 2)
    # The diagonal seed sits below the cheeks and around the nape. Fit BOTH
    # sides of its clearance to actual skin: only pushing intersecting points
    # outward leaves a floating hoop on narrower parts of the neck.
    seed = v((math.cos(a) * (.310 + .010 * t + fold),
              .82 - .12 * math.sin(a) + (t - .5) * .084 + .006 * math.cos(a + .5),
              .44 + math.sin(a) * (.239 + fold) + (t - .5) * .070))
    hit, normal, _, _ = body_tree.find_nearest(seed)
    return game(hit + normal * .014)


# Reverse vertical UV to keep weave tangent handedness conventional.
grid('Scarf | soft neck band', 'scarf', 'fabric', 4, 56, scarf_point,
     lambda t, s: (s * 1.74, t * .084), .011)
for t in (0, 1):
    piping('Scarf | neck edge ' + str(t), 'scarf', [scarf_point(t, i / 56) for i in range(57)], .0045, 'fabric')


def tail_point(t, s, right=False):
    side = 1 if right else -1
    width = (.084 if right else .105) * (1 - .07 * t)
    center_x = side * ((.074 if right else .111) + (.054 if right else .071) * t)
    y = .734 - t * (.242 if right else .322)
    # The ends fall down the bib with a gentle twist and a lifted free tip.
    z = .722 + .046 * math.sin(t * math.pi * .85) + .010 * t * t
    z += math.sin(s * math.pi * 3 + .5) * (.003 + .006 * t)
    z += (s - .5) * .025 * math.sin(t * math.pi * 1.2)
    return (center_x + (s - .5) * width, y + .008 * math.sin(s * math.pi) * t, z)


for right in (False, True):
    label = 'short' if right else 'long'
    length = .272 if right else .38
    width = .084 if right else .105
    grid('Scarf | ' + label + ' draped tail', 'scarf', 'fabric', 20, 8,
         lambda t, s, r=right: tail_point(t, s, r), lambda t, s: (s * width, t * length), .008)
    for edge in (0, 1):
        piping('Scarf | ' + label + ' stitched edge ' + str(edge), 'scarf',
               [tail_point(i / 20, edge, right) for i in range(21)], .0032, 'fabric', 4)
    # Two narrow knitted stripes are actual cloth strips following the folds.
    for stripe in (.72, .87):
        grid('Scarf | ' + label + ' woven stripe ' + str(stripe), 'scarf', 'trim', 1, 8,
             lambda t, s, r=right, st=stripe: tuple(a + (0 if i != 2 else .005) for i, a in enumerate(tail_point(st + (t - .5) * .034, s, r))),
             lambda t, s: (s * width, t * .014))
    piping('Scarf | ' + label + ' folded hem', 'scarf', [tail_point(1, i / 8, right) for i in range(9)], .004, 'trim')
    for strand in range(7):
        p = tail_point(1, (strand + .5) / 7, right)
        piping('Scarf | ' + label + ' fringe ' + str(strand), 'scarf',
               [p, (p[0] + .002 * math.sin(strand), p[1] - .020, p[2] + .005),
                (p[0] + .003 * math.sin(strand), p[1] - .031 - .003 * (strand % 2), p[2] + .004)],
               .0023, 'trim', 4)


def export_mesh(ob):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active
    positions, normals, coords, indices = [], [], [], []
    # Loop vertices retain the hem's split normals and every authored UV seam.
    lookup = {}
    for triangle in mesh.loop_triangles:
        for loop_index in triangle.loops:
            loop = mesh.loops[loop_index]
            p = game(mesh.vertices[loop.vertex_index].co)
            n = game(mesh.corner_normals[loop_index].vector)
            tex = tuple(uv.data[loop_index].uv)
            key = tuple(round(value, 6) for value in (*p, *n, *tex))
            if key not in lookup:
                lookup[key] = len(positions) // 3
                positions.extend(key[:3])
                normals.extend(key[3:6])
                coords.extend(key[6:])
            indices.append(lookup[key])
    evaluated.to_mesh_clear()
    return {'role': ob['role'], 'positions': positions, 'normals': normals, 'uvs': coords, 'indices': indices}


# Keep the flat free tails loose. Their contact correction only pushes skin
# intersections out; the fitted band and its round piping were authored above.
for ob in pieces['scarf'][3:]:
    for vertex in ob.data.vertices:
        for _ in range(3):
            hit, normal, _, _ = body_tree.find_nearest(vertex.co)
            signed = (vertex.co - hit).dot(normal)
            if signed >= .014:
                break
            vertex.co += normal * (.014 - signed)
    ob.data.update()
bpy.context.view_layer.update()
data = {garment: [export_mesh(ob) for ob in objects] for garment, objects in pieces.items()}
(GENERATED / 'costume-geometry.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
clearance = {}
for garment, meshes in {**data, 'scarf_band': data['scarf'][:3]}.items():
    values = []
    points = []
    for mesh in meshes:
        positions = mesh['positions']
        for index in range(0, len(positions), 3):
            point = v(positions[index:index + 3])
            hit, normal, _, distance = body_tree.find_nearest(point)
            values.append((point - hit).dot(normal))
            points.append(positions[index:index + 3])
    clearance[garment] = {'minimum_signed_clearance': min(values),
                          'maximum_signed_clearance': max(values),
                          'p95_signed_clearance': float(np.percentile(values, 95)),
                          'vertices_inside_skin': sum(value < -.001 for value in values),
                          'vertices': len(values),
                          'closest_point': points[values.index(min(values))]}
(SOURCE / 'rest-fit.json').write_text(json.dumps(clearance, indent=2), encoding='utf-8')

# Keep the scarf to the right of the cape in the workshop only. Exports were
# captured first at the proper cat pivot coordinates.
for ob in pieces['scarf']:
    ob.location.x = 1.12


def point_at(ob, target):
    ob.rotation_euler = (v(target) - ob.location).to_track_quat('-Z', 'Y').to_euler()


bpy.ops.object.camera_add(location=v((2.9, 2.3, 3.4)))
camera = bpy.context.object
camera.name = 'Fabric workshop camera'
point_at(camera, (.55, .71, .05))
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 2.55
scene.camera = camera
for name, position, power, size in [('Key softbox', (1, 3, 3), 430, 3), ('Fill softbox', (-3, 2, 1), 220, 2), ('Rim softbox', (1, 2, -3), 330, 2)]:
    bpy.ops.object.light_add(type='AREA', location=v(position))
    light = bpy.context.object
    light.name = name
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    point_at(light, (.55, .7, 0))
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(SOURCE / 'fabric-workshop.png')
scene.render.film_transparent = False
# Source remains readily editable; all thickness modifiers are kept live.
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'costumes.blend'))
bpy.ops.render.render(write_still=True)
print('COSTUME_EXPORT ' + json.dumps({name: {'triangles': sum(len(p['indices']) // 3 for p in meshes), 'vertices': sum(len(p['positions']) // 3 for p in meshes)} for name, meshes in data.items()}))
