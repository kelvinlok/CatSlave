"""Author the movable holiday tree. Run with Blender --background --factory-startup --python.
Creates a separate scene, exports only the tree, then renders a studio preview.
The three TreeLights_N material channels are animated by the game at runtime.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/christmas-tree'
ART = ROOT / 'artifacts/christmas-tree'
OUT.mkdir(parents=True, exist_ok=True)
ART.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new('Christmas tree | movable furniture')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
random.seed(2412)
parts = []

def linear(v): return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
def material(name, hexcolor, rough=.5, metal=0, glow=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    c = tuple(linear(int(hexcolor[i:i+2], 16) / 255) for i in (0,2,4))
    m.diffuse_color = (*c,1)
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*c,1)
    node.inputs['Roughness'].default_value = rough
    node.inputs['Metallic'].default_value = metal
    node.inputs['Emission Color'].default_value = (*c,1)
    node.inputs['Emission Strength'].default_value = glow
    return m

pine = [material('Pine deep', '174935', .83), material('Pine fern', '286347', .79), material('Pine tips', '397852', .76)]
bark = material('Tree bark', '6a4631', .9)
gold = material('Brushed champagne gold', 'dcb46b', .27, .72)
red = material('Cranberry lacquer', 'ae2540', .22, .18)
teal = material('Teal lacquer', '3c9792', .24, .25)
velvet = material('Burgundy tree skirt', '782838', .9)
wire = material('Light strip backing', 'b89551', .43, .45)
lights = [material('TreeLights_' + str(i), c, .3, .05, 2.5) for i,c in enumerate(['fff0bd', 'ffd186', 'ffedda'])]

def finish(obj, name, mat):
    obj.name = name; obj.data.materials.append(mat); parts.append(obj)
    for face in obj.data.polygons: face.use_smooth = True
    return obj

def sphere(name, position, radius, mat, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius, location=position)
    obj = bpy.context.object; obj.scale = scale
    return finish(obj, name, mat)

def cylinder(name, position, radius, depth, mat, top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=radius, radius2=radius if top is None else top, depth=depth, location=position)
    return finish(bpy.context.object, name, mat)

def mesh(name, verts, faces, mat):
    data = bpy.data.meshes.new(name); data.from_pydata(verts, [], faces); data.update()
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj)
    return finish(obj, name, mat)

def tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    curve.bevel_depth = radius; curve.bevel_resolution = 1
    spline = curve.splines.new('POLY'); spline.points.add(len(points)-1)
    for p, co in zip(spline.points, points): p.co = (*co,1)
    obj = bpy.data.objects.new(name, curve); scene.collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object, name, mat)

cylinder('Round velvet skirt', (0,0,.025), .63, .05, velvet)
cylinder('Gold stand foot', (0,0,.07), .25, .09, gold, .23)
cylinder('Trunk', (0,0,.28), .075, .5, bark, .058)
# Twelve curved branch skirts with scalloped, downward-pointing tips.
tiers = []
for tier in range(12):
    z = .35 + tier * .164; radius = .58 * (1 - tier / 13)
    height = .47 if tier < 9 else .38
    tiers.append((z, radius, height))
    verts=[]; faces=[]; sides=72; rows=6
    for row in range(rows+1):
        t = row / rows
        for i in range(sides):
            a = i / sides * math.tau
            wave = math.cos(a * 12 + tier * .75)
            r = radius * (1 - t) ** 1.15 * (1 + .055 * wave) + .006
            verts.append((r * math.cos(a), r * math.sin(a), z + t * height - .035 * (1-t) * wave))
            if row:
                n=row*sides+i; prev=row*sides+(i+1)%sides
                faces.append((n-sides, prev-sides, prev, n))
    mesh('Scalloped branch tier %02d' % tier, verts, faces, pine[tier%3])
    # Small drooping needle fans along the silhouette give the foliage depth.
    for i in range(24):
        a=i/24*math.tau+tier*.23
        r=radius*.94
        for offset in [-.025,.025]:
            b=a+offset
            p=(r*math.cos(b),r*math.sin(b),z+.035)
            q=((r+.025)*math.cos(b),(r+.025)*math.sin(b),z-.025)
            tangent=(-math.sin(b)*.018, math.cos(b)*.018,0)
            mesh('Needle fan',[(p[0]+tangent[0],p[1]+tangent[1],p[2]),(p[0]-tangent[0],p[1]-tangent[1],p[2]),q],[(0,1,2)],pine[(tier+1)%3])

def envelope(z):
    return max([r * max(0,1-(z-base)/h) ** 1.15 * 1.055 + .006 for base,r,h in tiers if base-.035 <= z <= base+h] or [.025])

spiral=[]
for i in range(601):
    t=i/600; z=.39+t*2.03; a=t*math.tau*5.2
    r=envelope(z)+.025
    spiral.append((r*math.cos(a),r*math.sin(a),z))
tube('Spiral light strip backing',spiral,.014,wire)
# Three continuous interleaved strip channels; bulbs reinforce sparkle at game scale.
for group in range(3):
    for start in range(group*20,600,60):
        tube('Spiral luminous strip',spiral[start:start+21],.015,lights[group])
for i in range(0,601,10): sphere('Fairy light',spiral[i],.024,lights[(i//10)%3],(1,1,1.2))
for i in range(38):
    z=.48+(i/38)*1.8; a=i*2.39996+.7; r=envelope(z)+.017
    p=(r*math.cos(a),r*math.sin(a),z)
    sphere('Hanging ornament',p,.045 if i%3 else .056,[red,gold,teal][i%3])
    cylinder('Ornament cap',(p[0],p[1],p[2]+.05),.013,.018,gold)
# Faceted five-point star, facing toward the front camera (negative Y).
verts=[(0,-.06,2.52),(0,.06,2.52)]
for side in [-1,1]:
    for i in range(10):
        a=math.pi/2+i*math.pi/5; r=.18 if i%2==0 else .078
        verts.append((math.cos(a)*r,side*.018,2.52+math.sin(a)*r))
faces=[]
for i in range(10):
    j=(i+1)%10
    faces.extend([(0,2+j,2+i),(1,12+i,12+j),(2+i,2+j,12+j,12+i)])
mesh('Faceted five point star',verts,faces,gold)

# Batch by material to cap draw calls while preserving editable source shapes.
bpy.context.view_layer.update()
source_collection = bpy.data.collections.new('Editable component source')
scene.collection.children.link(source_collection)
export_collection = bpy.data.collections.new('Game export | material batches')
scene.collection.children.link(export_collection)
for obj in parts:
    for collection in list(obj.users_collection): collection.objects.unlink(obj)
    source_collection.objects.link(obj)
exported=[]
for mat in [*pine,bark,gold,red,teal,velvet,wire,*lights]:
    copies=[]
    for obj in parts:
        if obj.data.materials[0] != mat: continue
        copy=obj.copy(); copy.data=obj.data.copy(); export_collection.objects.link(copy); copies.append(copy)
    if not copies: continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies: obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]; bpy.ops.object.join()
    obj=bpy.context.object; obj.name='Tree / '+mat.name; exported.append(obj)
source_collection.hide_render=True; source_collection.hide_viewport=True
root=bpy.data.objects.new('ChristmasTree',None); export_collection.objects.link(root)
for obj in exported: obj.parent=root
root['asset']='movable-christmas-tree'; root['lightMaterials']='TreeLights_0,TreeLights_1,TreeLights_2'
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in exported: obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/christmas-tree.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_extras=True)

scene.world=bpy.data.worlds.new('Tree studio world'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.23,.2,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object; floor.name='Preview ground (not exported)'; floor.data.materials.append(material('Preview sage','344d43',.95))
for name,pos,energy,size in [('Key',(3,-4,5),450,4),('Fill',(-3,-1,3),250,3),('Rim',(1,3,4),600,3)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=pos
    obj.rotation_euler=(Vector((0,0,1.3))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Tree portrait'); camera=bpy.data.objects.new('Tree portrait',data); scene.collection.objects.link(camera)
camera.location=(3,-5,2.8); camera.rotation_euler=(Vector((0,0,1.35))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=3.2; scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=32
scene.render.resolution_x=720; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.filepath=str(ART/'tree-preview.png')
# Blender preview animation mirrors the game's slow, phased light pulse.
scene.frame_start=1; scene.frame_end=120; scene.render.fps=30
for index, mat in enumerate(lights):
    strength=mat.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    for frame in range(1,122,10):
        strength.default_value=.6+2.4*(.5+.5*math.sin((frame-1)/120*math.tau+index*math.tau/3))
        strength.keyframe_insert(data_path='default_value',frame=frame)
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'tree.blend'))
bpy.ops.render.render(write_still=True)
stats={'meshes':len(exported),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exported),'materials':[m.name for m in lights],'height':2.7,'maxRadius':.65}
(ART/'model-stats.json').write_text(json.dumps(stats,indent=2))
print(json.dumps(stats))
