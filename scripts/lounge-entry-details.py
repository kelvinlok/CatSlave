"""Entry corner from the user's sofa/door annotation and supplied logo.

Executed by build-lounge.py after the final room orientation is established.
All helper positions use game axes (Y up). The door stays closed; it does not
extend the walkable floor or change the room's existing navigation boundary.
"""
from mathutils import Matrix

# Build an actual wall opening, with skirting stopped at the jambs.
group = scene.objects['02 | architectural shell']
for name in ['Main room near wall', 'Near wall skirting']:
    bpy.data.objects.remove(scene.objects[name], do_unlink=True)
door_left, door_right, door_height = -2.7, -.9, 3.45
for label, lo, hi in [('cabinet side', -5.1, door_left), ('sofa side', door_right, 5.1)]:
    cube('Entry wall | '+label, ((lo+hi)/2, 2.7, 8.08), (hi-lo, 5.4, .16), wall, .008)
    cube('Entry skirting | '+label, ((lo+hi)/2, .12, 7.96), (hi-lo, .24, .05), trim, .008)
cube('Entry door lintel', (-1.8, (5.4+door_height)/2, 8.08),
     (1.8, 5.4-door_height, .16), wall, .008)

section('15 | clear glass entry door')
frame = mat('Entry | graphite aluminum frame', '454b49', .34, .65)
hardware = mat('Entry | brushed nickel hardware', 'a5aaa7', .26, .78)
clear = mat('Entry | clear door glass', 'f1fbf9', .075)
bs = clear.node_tree.nodes['Principled BSDF']
bs.inputs['Transmission Weight'].default_value = 1
bs.inputs['IOR'].default_value = 1.45
bs.inputs['Coat Weight'].default_value = .18

for x in [door_left+.038, door_right-.038]:
    cube('Entry door | slim jamb', (x, door_height/2, 8.005), (.075, door_height, .13), frame, .009)
cube('Entry door | top frame', (-1.8, door_height-.038, 8.005), (1.8, .075, .13), frame, .009)
cube('Entry door | low threshold', (-1.8, .024, 8.005), (1.8, .048, .18), hardware, .008)
pane = cube('Entry door | single clear tempered pane', (-1.8, 1.72, 8.005),
            (1.63, 3.29, .018), clear, .004)
pane['construction'] = 'Transparent glass in a real wall opening; closed entry door'
for y in [.62, 2.83]:
    cube('Entry door | glass hinge', (-2.61, y, 7.97), (.13, .16, .07), hardware, .014)
for z in [7.87, 8.14]:
    rod('Entry door | vertical pull', (-1.16, 1.21, z), (-1.16, 1.94, z), .024, hardware)
    for y in [1.25, 1.9]:
        rod('Entry door | handle mount', (-1.16, y, 8.005), (-1.16, y, z), .019, hardware)

# A restrained recessed landing makes the transparency visible from the lounge.
# It is scenery beyond the closed door, not a new playable room.
vestibule = mat('Entry | vestibule plaster', 'c7c8bd', .95)
tile = mat('Entry | landing stone', 'c3c2b6', .76)
cube('Entry landing | floor', (-1.8, -.04, 8.8), (1.8, .08, 1.6), tile, 0)
cube('Entry landing | rear wall', (-1.8, 1.75, 9.63), (1.96, 3.5, .12), vestibule, .005)
for x in [-2.75, -.85]:
    cube('Entry landing | side return', (x, 1.75, 8.84), (.1, 3.5, 1.68), wall, .005)
cube('Entry landing | ceiling', (-1.8, 3.51, 8.84), (1.9, .1, 1.68), trim, .005)
cube('Entry landing | rear skirting', (-1.8, .09, 9.55), (1.8, .18, .035), trim, .004)
for x in [-2.1, -1.5]:
    cube('Entry landing | stone joint', (x, .002, 8.8), (.005, .003, 1.6), graydark, 0)
cube('Entry landing | ceiling diffuser', (-1.8, 3.445, 8.8), (.6, .018, .13), glow, .004)

section('16 | raised Namaoste wall logo')
logo_material = mat('Logo | satin charcoal lettering', '171b18', .4, .14)
traced = json.loads((OUT/'namaoste-logo-contours.json').read_text(encoding='utf-8'))
bx, by, bw, bh = traced['bounds']
scale = 2.3 / bw
for index, rings in enumerate(traced['shapes']):
    data = bpy.data.curves.new('Logo silhouette '+str(index), 'CURVE')
    data.dimensions = '2D'; data.fill_mode = 'BOTH'
    data.extrude = .013; data.bevel_depth = .0008; data.bevel_resolution = 1
    for ring in rings:
        spline = data.splines.new('POLY'); spline.points.add(len(ring)-1)
        for point, (px, py) in zip(spline.points, ring):
            point.co = ((px-bx-bw/2)*scale, (by+bh/2-py)*scale, 0, 1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new('Logo | raised reference stroke '+str(index), data)
    scene.collection.objects.link(obj); finish(obj, obj.name, logo_material)
    # Image right -> -game Z; face normal -> +game X, into the room.
    obj.matrix_world = Matrix(((0,0,1,-4.973), (1,0,0,-5.9), (0,1,0,3.25), (0,0,0,1)))
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    obj['source'] = traced['source']
    obj['construction'] = 'Solid 26 mm raised logo; original lettering and holes preserved'

scene['entryRevision'] = 'Two-seat olive sofa, clear glass door, raised supplied logo'
