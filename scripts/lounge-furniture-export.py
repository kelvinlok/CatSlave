"""Stable furniture ownership applied after all authored lounge corrections.

The source keeps its original sections for repeatable correction scripts. Export
copies are parented to independent floor pivots without changing world geometry.
"""
import bpy, hashlib, json
from mathutils import Vector


def prepare_furniture(scene, root, output):
    layout = json.loads((output / 'layout.json').read_text(encoding='utf-8'))
    obstacles = {box['id']: box for box in layout['obstacles']}
    # A tagged editable source can be exported again without duplicate pivots.
    rotor = scene.objects['CatWheelRotor']
    rotor.parent = root
    rotor.matrix_parent_inverse.identity()
    wheel = layout['furniture']['wheel']
    rotor.location = (wheel['x'], -wheel['z'], wheel['centerY'])
    for old in list(scene.objects):
        if old.get('furnitureId') and old.type == 'EMPTY':
            bpy.data.objects.remove(old, do_unlink=True)
    # Physical placement cores omit flexible leaves/fringe and high tree foliage.
    # Navigation retains the previously authored obstacle shapes separately.
    specs = [
        ('sofa', 'Olive sofa', 2.65, 6.4, ['green-sofa'], None),
        ('loveseat', 'Cream loveseat', 4.15, 4.2, ['cream-loveseat'], None),
        ('chair-1', 'Floor chair 1', -5.74, -4.75, ['floor-chair-a'], None),
        ('chair-2', 'Floor chair 2', -5.74, -2.3, ['floor-chair-b'], None),
        ('chair-3', 'Floor chair 3', -3.4, -7.05, ['mural-chair-left'], None),
        ('chair-4', 'Floor chair 4', -1.85, -7.05, ['mural-chair-right'], None),
        ('table-1', 'Mural table', -4.85, -6, ['table-a-leg-0', 'table-a-leg-1', 'table-a-leg-2'], [(-.55, .55, -.55, .55)]),
        ('table-2', 'Side table', -4.65, -3.45, ['table-b-leg-0', 'table-b-leg-1', 'table-b-leg-2'], [(-.55, .55, -.55, .55)]),
        ('table-3', 'Sofa table', 1.25, 5.23, ['table-c-leg-0', 'table-c-leg-1', 'table-c-leg-2'], [(-.55, .55, -.48, .48)]),
        ('bed-1', 'Pink flower bed', .45, -5.5, [], [(-.80, .80, -.78, .78)]),
        ('bed-2', 'White flower bed', -6.7, -.05, [], [(-.60, .60, -.33, .60)]),
        ('bed-3', 'Orange flower bed', 3.1, 2.25, [], [(-.60, .60, -.52, .52)]),
        ('pod', 'Bentwood pod', 0, -7.05, ['mustard-pod'], None),
        ('tree', 'Entrance cat tree', -6.85, 1.7, ['entry-tree'], None),
        ('window-tree', 'Window cat tree', 4.05, 6.3, ['sunroom-tree'], [(-.37, .47, -.50, .50)]),
        ('recliner-1', 'Window recliner 1', 5.9, 3.25, ['recliners'], [(-.75, 1.53, -.69, .69)]),
        ('recliner-2', 'Window recliner 2', 5.9, 4.8, ['recliners'], [(-.75, 1.53, -.69, .69)]),
        ('wheel', 'Exercise wheel', layout['furniture']['wheel']['x'], layout['furniture']['wheel']['z'], ['cat-wheel'], None),
    ]
    manifest = {'revision': 0, 'items': []}
    roots = {}
    for id, label, x, z, ids, boxes in specs:
        if boxes is None:
            boxes = [(obstacles[key]['minX']-x, obstacles[key]['maxX']-x,
                      obstacles[key]['minZ']-z, obstacles[key]['maxZ']-z) for key in ids]
        item = {'id': id, 'label': label, 'x': x, 'z': z,
                'footprints': [dict(zip(('minX', 'maxX', 'minZ', 'maxZ'), [round(n, 5) for n in b])) for b in boxes],
                'obstacleIds': ids}
        manifest['items'].append(item)
        pivot = bpy.data.objects.new('Furniture | '+id, None)
        scene.collection.objects.link(pivot)
        pivot.parent = root
        pivot.location = (x, -z, 0)
        pivot['furnitureId'] = id
        pivot['furnitureLabel'] = label
        roots[id] = pivot

    centers = {item['id']: (item['x'], item['z']) for item in manifest['items']}
    def ancestors(ob):
        result = []
        while ob:
            result.append(ob.name)
            ob = ob.parent
        return result

    def center(ob):
        p = sum((ob.matrix_world @ Vector(c) for c in ob.bound_box), Vector()) / 8
        return p.x, -p.y

    def nearest(ob, ids):
        x, z = center(ob)
        return min(ids, key=lambda key: (centers[key][0]-x)**2+(centers[key][1]-z)**2)

    counts = {id: 0 for id in roots}
    for ob in list(scene.objects):
        if ob.type != 'MESH':
            continue
        chain = ancestors(ob)
        owner = None
        if '06 | olive sofa with tailored draped cushions' in chain:
            owner = 'sofa'
        elif '09 | cream loveseat by sunroom opening' in chain:
            owner = 'loveseat'
        elif '07 | lounge floor chairs and occasional tables' in chain:
            chair_names = ['Gray floor chair 1', 'Gray floor chair 2', 'Mural floor chair left', 'Mural floor chair right']
            owner = next(('chair-'+str(i+1) for i, name in enumerate(chair_names) if name in chain), None)
            if owner is None:
                owner = nearest(ob, ['chair-1', 'chair-2', 'chair-3', 'chair-4', 'table-1', 'table-2', 'table-3'])
        elif '08 | flower beds and rounded cat hideaway' in chain:
            owner = 'pod' if ob.name.startswith(('Pod |', 'Pod angled')) else nearest(ob, ['bed-1', 'bed-2', 'bed-3'])
        elif '11 | pair of window recliners' in chain:
            owner = nearest(ob, ['recliner-1', 'recliner-2'])
        elif '15 | distinct branching window tree' in chain:
            owner = 'window-tree'
        elif '12 | natural cat trees and entry curtain' in chain and not ob.name.startswith(('Hanging cream', 'Entrance curtain')):
            owner = 'tree'
        elif '21 | white cat exercise wheel' in chain or 'CatWheelRotor' in chain:
            owner = 'wheel'
        if owner:
            ob['furnitureOwner'] = owner
            counts[owner] += 1
        if ob.name.startswith('Soft furniture contact'):
            ob['contactShadow'] = True
        # Hide overhead/outer-shell occluders, keeping floor and low furnishings.
        if not owner and any(name.startswith(('02 |', '03 |', '05 |', '15 | clear', '16 |', '17 |', '18 |', '19 |', '20 |')) for name in chain):
            ob['editorHide'] = True
        if not owner and ob.name.startswith(('Hanging cream', 'Entrance curtain', 'Tall black partition', 'Black partition', 'Frosted screen')):
            ob['editorHide'] = True
    assert all(counts.values()), 'Furniture ownership incomplete: '+str(counts)
    bpy.context.view_layer.update()
    transform = rotor.matrix_world.copy()
    rotor.parent = roots['wheel']
    rotor.matrix_world = transform
    # A safe-integer content revision changes whenever the floorplan or authored
    # furniture definitions do, so update notices never depend on a manual bump.
    revision_source = json.dumps({'layout': layout, 'items': manifest['items']}, sort_keys=True, separators=(',', ':'))
    manifest['revision'] = int(hashlib.sha256(revision_source.encode('utf-8')).hexdigest()[:12], 16)
    (output/'furniture-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print('FURNITURE_OWNERS', json.dumps(counts), flush=True)
    return roots


def export_furniture_room(scene, root, furniture_roots, filepath):
    """Merge by ownership/material while preserving editor and wheel subgroups."""
    deps = bpy.context.evaluated_depsgraph_get()
    batches = {}
    print('LOUNGE_STAGE evaluating export geometry', flush=True)
    for ob in list(scene.objects):
        if ob.type != 'MESH':
            continue
        evaluated = ob.evaluated_get(deps)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=deps)
        copy = bpy.data.objects.new(ob.name+' export', mesh)
        copy.matrix_world = ob.matrix_world.copy()
        material = ob.data.materials[0].name if ob.data.materials else 'None'
        is_rotor = bool(ob.parent and ob.parent.get('catWheelRotor', False))
        key = (ob.get('furnitureOwner', ''), bool(ob.get('editorHide', False)), bool(ob.get('contactShadow', False)), is_rotor, material)
        batches.setdefault(key, []).append(copy)
    # Linking a copy dirties the dependency graph. Finish evaluating every
    # source mesh first instead of reevaluating the growing scene per mesh.
    for objects in batches.values():
        for ob in objects:
            scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    print('LOUNGE_STAGE merging furniture material batches', flush=True)
    exported = []
    for (owner, hidden, shadow, rotor, material), objects in batches.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = 'Lounge | '+(owner+' | ' if owner else '')+material
        transform = merged.matrix_world.copy()
        merged.parent = scene.objects['CatWheelRotor'] if rotor else furniture_roots.get(owner, root)
        merged.matrix_world = transform
        if hidden:
            merged['editorHide'] = True
        if shadow:
            merged['contactShadow'] = True
        if owner == 'wheel':
            merged['catWheel'] = True
        exported.append(merged)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root, scene.objects['CatWheelRotor'], *furniture_roots.values(), *exported]:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_cameras=False,
                              export_lights=False, export_extras=True)
    stats = {'meshes': len(exported),
             'triangles': sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in exported),
             'materials': len({material for _, _, _, _, material in batches}),
             'batches': len(batches), 'movableItems': len(furniture_roots),
             'glbBytes': filepath.stat().st_size}
    return exported, stats
