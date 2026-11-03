"""Reconstruct the furnished lounge in n.mp4 using Blender, then export to Three.js.
Run: blender --background --python scripts/build-lounge.py
Game-space helpers use x/right, y/up, z/toward the window; dimensions are estimates.
Creates a new scene: never deletes or edits an existing scene.
"""
import bpy, math, random, json, sys, argparse
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/lounge'
ART = ROOT / 'artifacts/lounge'
OUT.mkdir(parents=True, exist_ok=True); ART.mkdir(parents=True, exist_ok=True)
parser=argparse.ArgumentParser()
parser.add_argument('--export-only',action='store_true',help='Save source and GLB without rendering all reference cameras')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
random.seed(27)
scene = bpy.data.scenes.new('Video lounge | furnished reconstruction')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.world = bpy.data.worlds.new('Lounge daylight')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.55,.65,.8,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .45

def v(p): return Vector((p[0],-p[2],p[1]))
def linear(a): return a/12.92 if a < .04045 else ((a+.055)/1.055)**2.4
def color(h): return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))
def mat(name, h, rough=.8, metal=0, emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); c=color(h)
    m.diffuse_color=(*c,1);bs.inputs['Base Color'].default_value=(*c,1)
    bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    if emission: bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=emission
    return m
wall=mat('Warm ivory plaster','dedbd1'); trim=mat('Painted off-white joinery','eeece4',.55)
black=mat('Black powder-coated steel','252728',.52,.3); walnut=mat('Walnut cubby carcass','554233',.65)
wood=mat('Pale oak furniture','b68b57',.63); seam=mat('Deep upholstery seams','727b64')
green=mat('Olive green sofa slipcover','85906b',.97); greenlight=mat('Sofa cushion piping','9ba383',.95)
gray=mat('Dove gray floor-chair fabric','a3a6a4',.95); graydark=mat('Chair piping and recessed seams','858b89',.9)
cream=mat('Cream loveseat upholstery','dfd9cc',.95); linen=mat('Warm gray recliner fabric','c4bfb6',.94)
pink=mat('Dusty rose flower petals','d6a49d'); yellow=mat('Mustard flower centers','d5a031'); white=mat('Ivory daisy petals','e9e3d1')
orange=mat('Terracotta flower bed','bd7a50'); rope=mat('Sisal wrapped poles','c6ae82')
leafm=[mat('Foliage '+str(i),h) for i,h in enumerate(['526645','6c8053','849363','3e5a36'])]
glow=mat('Warm cove LED diffusers','fff1c6',.45,emission=2.0)
glass=mat('Frosted partition panels','d4d1c7',.48)
blue=mat('Pale blue window glass','b7d5e0',.3)

root=bpy.data.objects.new('CatLounge',None);scene.collection.objects.link(root)
root['source']='User-provided n.mp4 walkthrough; furniture retained, toys and loose clutter omitted'
root['scale_note']='Estimated scale. Not a measured architectural survey.'
group=root
def section(name):
    global group
    group=bpy.data.objects.new(name,None);scene.collection.objects.link(group);group.parent=root
    return group
def finish(o,name,m):
    o.name=name;o.parent=group
    if m:o.data.materials.append(m)
    return o
def cube(name,p,s,m,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=v(p));o=bpy.context.object
    o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,m)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL')
    return o
def ellipsoid(name,p,s,m,rot=0):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=v(p));o=bpy.context.object
    o.scale=(s[0],s[2],s[1]);o.rotation_euler.z=-rot
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,name,m)
def rod(name,a,b,r,m,r2=None):
    a=v(a);b=v(b);d=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=16,radius1=r,radius2=r if r2 is None else r2,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    for f in o.data.polygons:f.use_smooth=True
    return finish(o,name,m)
def mesh(name,verts,faces,m):
    me=bpy.data.meshes.new(name);me.from_pydata([v(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);return finish(o,name,m)
def panel(name,pts,m):return mesh(name,pts,[(0,1,2,3)],m)
def cushion(name,p,s,m):
    o=cube(name,p,s,m,min(s)*.32)
    return o
def contact(x,z,rx,rz):
    # Layered geometric ambient contact shadows survive a no-shadow mobile renderer.
    for k in range(3):
        m=shadowm[k]
        verts=[(x, .008+k*.001,z)]+[(x+cos(i*pi/24)*rx*(1-k*.13),.008+k*.001,z+sin(i*pi/24)*rz*(1-k*.13)) for i in range(49)]
        mesh('Soft furniture contact',verts,[(0,i+1,i+2) for i in range(48)],m)
shadowm=[]
for i in range(3):
    m=mat('Baked contact '+str(i),'544838');m.diffuse_color=(*color('544838'),.035+i*.018)
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Alpha'].default_value=.035+i*.018
    m.surface_render_method='DITHERED';shadowm.append(m)

section('01 | oak plank floor')
floorM=[mat('Oak plank tone '+str(i),h,.7) for i,h in enumerate(['c79e70','d0a87b','cca273','d5ad80','c39a6d','cda77c'])]
cube('Subfloor',(0,-.12,0),(10.2,.2,16.2),wood,0)
for ix in range(20):
    x=-4.75+ix*.5
    for iz in range(9):
        start=-8+iz*2+(ix%3)*.63
        lo=max(-8,start-2);hi=min(8,start)
        if hi>lo:cube('Individual staggered oak board',(x,-.015,(lo+hi)/2),(.494,.03,hi-lo-.006),random.choice(floorM),.003)

section('02 | architectural shell')
cube('Mural end wall',(0,2.7,-8.08),(10.2,5.4,.16),wall)
for x in [-5.08,5.08]:
    cube('Side plaster wall',(x,2.7,0),(.16,5.4,16.3),wall)
    cube('Skirting',(x*.977,.12,0),(.06,.24,16),trim,.008)
cube('End skirting',(0,.12,-7.96),(10,.24,.05),trim,.008)
# Wide opening connects lounge to the bright window seating alcove.
for x in [-4.3,4.3]:cube('Sunroom opening pier',(x,2.7,3.65),(1.4,5.4,.23),trim)
cube('Sunroom opening header',(0,4.75,3.65),(7.2,1.3,.23),trim)
cube('Window sill wall',(0,.72,7.94),(10,1.44,.15),wall)
cube('Window head',(0,5.1,7.94),(10,.6,.18),trim)
for x in [-4.9,-2.48,0,2.48,4.9]:cube('Aluminum window mullion',(x,3.2,7.92),(.07,3.5,.13),trim,.008)
for y in [1.48,3.05,4.88]:cube('Window horizontal frame',(0,y,7.9),(9.85,.065,.13),trim,.008)
# Opaque pale blue backdrop with architectural skyline is entirely behind the glass frame.
cube('Blue sky beyond glazing',(0,3.35,8.18),(10.1,3.8,.05),blue,0)
citym=[mat('Distant skyline '+str(i),h) for i,h in enumerate(['91a4aa','a5b2b3','c1c4bf','acb5b8'])]
for i in range(21):
    x=-4.8+i*.48;h=random.uniform(.65,2.65)
    cube('Distant urban building',(x,1.5+h/2,8.12),(random.uniform(.35,.65),h,.04),random.choice(citym),0)
    for yy in range(int(h/.15)):
        cube('Distant window stripe',(x,1.6+yy*.15,8.09),(.26,.025,.015),blue,0)

section('03 | ceiling and track lights')
for x in range(5):
    for z in range(8):cube('Acoustic ceiling tile',(-4+x*2,5.43,-7+z*2),(1.98,.1,1.98),trim,.005)
for x in [-4.83,4.83]:cube('Perimeter warm cove light',(x,5.24,0),(.055,.055,15.8),glow,.005)
for z in [-7.83,7.8]:cube('Perimeter warm cove light',(0,5.24,z),(9.65,.055,.055),glow,.005)
for z in [-5.7,-.5,5.8]:
    cube('Black lighting track',(0,5.25,z),(8.7,.08,.1),black,.01)
    for x in [-3,0,3]:
        rod('Spotlight hanger',(x,5.25,z),(x,4.98,z),.025,black)
        rod('Cylindrical track spotlight',(x,4.98,z),(x,4.57,z-.18),.105,black)
        ellipsoid('Warm spotlight lens',(x,4.57,z-.18),(.08,.015,.08),glow)

section('04 | walnut cubbies and black grid screen')
cube('Cubby back',(-4.83,.83,-4),( .08,1.66,7.2),walnut,.01)
for y in [.04,.82,1.59]:cube('Continuous cubby shelf',(-4.25,y,-4),(1.3,.06,7.2),walnut,.012)
for z in [-7.6,-6.7,-4.9,-4,-3.1,-2.2,-1.3,-.4]:
    cube('Cubby vertical divider',(-4.25,.83,z),(1.3,1.6,.045),walnut,.008)
cube('Cabinet top edge',(-4.25,1.6,-4),(1.34,.04,7.28),wood,.008)
# Screen is above cabinets; front faces toward central aisle (+x).
for z in [-7.6,-6.4,-5.2,-4,-2.8,-1.6,-.4]:
    cube('Tall black partition upright',(-4.28,3.24,z),(.06,3.22,.055),black,.008)
for y in [1.68,2.48,3.28,4.08,4.88]:cube('Black partition crossbar',(-4.28,y,-4),(.055,.045,7.2),black,.006)
for z in [-7,-5.8,-4.6,-3.4,-2.2,-1]:cube('Frosted screen pane',(-4.31,3.28,z),(.018,3.14,1.15),glass,.002)
# Right folding screen beside mural.
for z in [-7.6,-6.7,-5.8]:
    for zz in [z-.43,z+.43]:cube('Folding screen vertical',(4.72,2.15,zz),(.045,4.3,.045),black,.005)
    cube('Folding screen linen panel',(4.74,2.15,z),(.018,4.22,.81),cream,0)
    for y in [.05,1.05,2.1,3.15,4.3]:cube('Folding screen rail',(4.7,y,z),(.06,.035,.87),black,.005)

section('05 | reference cat mural and foliage')
cube('Mural recessed surround',(0,3.15,-7.94),(5.6,2.65,.1),trim,.01)
mural=mat('Cat mural sampled from supplied walkthrough','ffffff',1)
im=bpy.data.images.load(str(OUT/'mural-reference.jpg'));im.pack()
node=mural.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
mural.node_tree.links.new(node.outputs['Color'],mural.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
o=panel('Wide eyed cat wall artwork',[(-2.7,1.88,-7.875),(2.7,1.88,-7.875),(2.7,4.4,-7.875),(-2.7,4.4,-7.875)],mural)
uv=o.data.uv_layers.new(name='UVMap')
for i,co in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[i].uv=co
cube('Mural projecting lower ledge',(0,1.86,-7.78),(5.75,.12,.35),wall,.025)
def leaf(name,p,length,width,angle,m):
    x,y,z=p;dx=cos(angle)*length/2;dy=sin(angle)*length/2
    verts=[(x-dx,y-dy,z),(x-dy*.15-width/2,y+dx*.15,z+.055),(x+dx,y+dy,z),(x+dy*.15+width/2,y-dx*.15,z+.055),(x,y,z+.1)]
    mesh(name,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],m)
for i in range(170):
    x=random.uniform(-3.1,3.1);y=random.uniform(4.55,4.95)-(.3 if i%8==0 else 0)
    leaf('Trailing mural greenery',(x,y,-7.7+random.uniform(0,.18)),random.uniform(.18,.44),random.uniform(.09,.22),random.uniform(0,pi),random.choice(leafm))

section('06 | olive sofa with tailored draped cushions')
contact(4.06,-2.225,.92,1.88)
cube('Sofa dark plinth',(4.12,.18,-2.225),(1.42,.22,3.35),walnut,.08)
cushion('Sofa upholstered base',(4.08,.43,-2.225),(1.55,.42,3.45),green)
for z in [-3.05,-1.4]:
    cushion('Separate sofa seat',(3.95,.68,z),(1.38,.2,1.6),green)
    # Back upholstery has broad, rounded pillows and subtle seams.
    cushion('Sofa back cushion',(4.68,1.18,z),(.37,1.23,1.6),green)
    cube('Seat front piping',(3.26,.71,z),(.025,.022,1.48),greenlight,.009)
    for j in range(5):
        dz=z-.62+j*.31
        rod('Slipcover gentle fold',(3.28,.38,dz),(3.3,.67,dz+.07),.009,greenlight)
for z in [-3.95,-.5]:cushion('Soft sofa arm',(4.05,.85,z),(1.56,.6,.22),green)

def floorchair(name,x,z,yaw=0):
    global group
    parent=group; pivot=bpy.data.objects.new(name,None);scene.collection.objects.link(pivot);pivot.parent=group
    # Build at origin then transform complete grouped chair.
    group=pivot
    cushion('Rounded low seat',(0,.16,0),(1.08,.29,1.12),gray)
    back=ellipsoid('Arched floor-chair back',(0,.64,-.43),(.55,.62,.15),gray)
    back.rotation_euler.x=math.radians(-13)
    ellipsoid('Back inner padded panel',(0,.66,-.275),(.46,.5,.045),graydark)
    ellipsoid('Back soft inset',(0,.68,-.225),(.44,.48,.055),gray)
    rod('Back hinge left',(-.45,.18,-.36),(-.45,.42,-.43),.045,graydark)
    rod('Back hinge right',(.45,.18,-.36),(.45,.42,-.43),.045,graydark)
    pivot.location=v((x,0,z));pivot.rotation_euler.z=yaw
    group=parent;contact(x,z,.65,.65)
def table(name,x,z,yaw=0):
    # Rounded triangular side table: custom boundary with smooth corners, three splayed legs.
    verts=[];n=48
    for y in [.78,.85]:
        for i in range(n):
            a=i*2*pi/n; r=.53*(1+.12*cos(3*a));verts.append((x+r*cos(a+yaw),y,z+r*sin(a+yaw)))
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name+' rounded triangular top',verts,faces,black);b=o.modifiers.new('Rounded tabletop lip','BEVEL');b.width=.025;b.segments=3;o.modifiers.new('Table normals','WEIGHTED_NORMAL')
    for a in [0,2*pi/3,4*pi/3]:rod('Splayed oak table leg',(x+.43*cos(a+yaw),.04,z+.43*sin(a+yaw)),(x+.28*cos(a+yaw),.78,z+.28*sin(a+yaw)),.035,wood,.045)
    contact(x,z,.48,.48)
section('07 | lounge floor chairs and occasional tables')
floorchair('Gray floor chair 1',-2.94,-4.75,pi/2-.2)
floorchair('Gray floor chair 2',-2.94,-2.3,pi/2+.1)
floorchair('Mural floor chair left',-1.3,-7.05,0)
floorchair('Mural floor chair right',.25,-7.05,-.15)
table('Table by mural',-2.05,-6,0)
table('Table by gray seats',-1.85,-3.45,.3)
table('Table by green sofa',2.78,-1.65,.5)

def flower(x,z,s,petalmat):
    contact(x,z,.85*s,.8*s)
    for i in range(6):
        a=i*pi/3;ellipsoid('Flower petal cushion',(x+cos(a)*.51*s,.2*s,z+sin(a)*.51*s),(.36*s,.18*s,.43*s),petalmat,-a)
    ellipsoid('Flower center seat',(x,.15*s,z),(.48*s,.11*s,.48*s),yellow)
    ellipsoid('Flower leaf',(x+.65*s,.05,z+.8*s),(.3*s,.04,.14*s),leafm[2],.5)
section('08 | flower beds and rounded cat hideaway')
flower(3.75,-6.7,1.0,pink)
flower(-3.9,-.05,.8,white)
flower(3.95,2.25,.8,orange)
# Hollow bentwood cat hideaway: side entrance, open cavity and clear glass lid.
exec((ROOT/'scripts/lounge-hollow-pod.py').read_text(encoding='utf-8'))

section('09 | cream loveseat by sunroom opening')
contact(-1.8,3.4,1.55,.8)
cushion('Loveseat base',(-1.8,.27,3.45),(2.8,.48,1.2),cream)
for x in [-2.48,-1.12]:
    cushion('Loveseat seat cushion',(x,.56,3.3),(1.3,.19,1.1),cream)
    cushion('Loveseat back cushion',(x,1.16,3.95),(1.3,1.18,.25),cream)
for x in [-3.13,-.47]:cushion('Loveseat soft arm',(x,.78,3.48),(.2,.75,1.14),cream)
# Woven geometric throw: an authored fabric panel with restrained rust/teal diamond motifs.
throw=mat('Woven throw oatmeal','c5bca8');rust=mat('Throw terracotta weave','a56849');teal=mat('Throw muted blue weave','617d7e')
panel('Woven throw over sofa',[(-2.85,.69,2.79),(-.85,.69,2.79),(-.85,1.7,3.83),(-2.85,1.7,3.83)],throw)
for j in range(4):
    for i in range(7):
        x=-2.7+i*.27;t=.13+j*.21;y=.69+t;z=2.79+t*1.02
        mesh('Woven diamond motif',[(x-.1,y,z-.008),(x,y+.1,z+.094),(x+.1,y,z-.008),(x,y-.1,z-.11)],[(0,1,2,3)],rust if (i+j)%2 else teal)

section('10 | sunroom window drawer cabinets')
cube('Continuous cabinet carcass',(0,.73,7.35),(9.65,1.46,1.0),trim,.025)
cube('Green window perch mat',(0,1.52,7.31),(9.7,.06,1.08),greenlight,.02)
for x in [-3.6,-1.2,1.2,3.6]:
    for y in [.25,.72,1.18]:
        cube('Individual broad drawer front',(x,y,6.83),(2.32,.43,.035),cream,.008)
        cube('Recessed drawer finger pull',(x,y+.16,6.805),(.55,.015,.015),graydark,.004)
cube('Window access step',(-1.3,.31,6.3),(1.15,.62,.75),trim,.04)
cube('Access step cushion',(-1.3,.635,6.3),(1.15,.03,.75),cream,.01)

def recliner(x,z):
    contact(x,z,.7,1.4)
    cube('Recliner timber foot',(x,.14,z),(.98,.22,1.1),walnut,.07)
    cushion('Recliner lower upholstered base',(x,.4,z),(1.2,.45,1.25),linen)
    cushion('Recliner seat cushion',(x,.7,z-.14),(.97,.2,1.0),linen)
    back=cushion('High segmented recliner back',(x,1.48,z+.49),(1.14,1.55,.32),linen);back.rotation_euler.x=.12
    cushion('Recliner padded head rest',(x,2.0,z+.35),(1.04,.4,.18),cream)
    cushion('Recliner lumbar cushion',(x,1.1,z+.24),(.91,.38,.18),cream)
    for xx in [x-.58,x+.58]:cushion('Recliner rolled arm',(xx,.88,z),( .22,.28,1.1),linen)
    cushion('Matching footstool',(x,.35,z-1.15),(1.15,.65,.74),linen)
section('11 | pair of window recliners')
recliner(2.45,5.8);recliner(4.0,5.8)

section('12 | natural cat trees and entry curtain')
def platform(name,x,y,z,r):
    rod(name,(x,y-.07,z),(x,y,z),r,wood)
    rod(name+' upholstered pad',(x,y,z),(x,y+.03,z),r*.92,cream)
    for i in range(22):
        a=i*2*pi/22;rod('Basket vertical slat',(x+cos(a)*r*.96,y-.04,z+sin(a)*r*.96),(x+cos(a)*r*.96,y+.13,z+sin(a)*r*.96),.025,wood)
cube('Entry tree base',(-4.05,.04,1.7),(1.6,.08,1.7),wood,.09)
rod('Entry tree sisal trunk',(-4.05,.08,1.7),(-4.05,3.65,1.7),.14,rope)
for x,z,h in [(-3.8,2.15,.53),(-4.15,1.65,1.19),(-3.85,1.3,1.93),(-4.05,1.7,3.62)]:
    rod('Tree platform branch',(-4.05,h-.3,1.7),(x,h-.06,z),.09,rope);platform('Entry tree basket',x,h,z,.53)
for i in range(55):
    a=random.uniform(0,2*pi);x=-4.05+cos(a)*random.uniform(.15,.65);z=1.7+sin(a)*.4
    leaf('Cat-tree artificial foliage',(x,random.uniform(2.7,3.5),z),.26,.12,random.uniform(0,pi),random.choice(leafm))
# Window-side tall climbing tree.
rod('Sunroom climbing trunk',(-4.15,.05,5.25),(-4.15,4.8,5.25),.12,rope)
for i in range(5):platform('Window climbing perch',-4.15+(i%2)*.35,.6+i*.84,5.25+(-1 if i%2 else 1)*.32,.52)
# Split noren curtain marks the entrance, against the side wall without blocking main camera.
for z in [2.7,3.35]:
    verts=[];faces=[]
    for j in range(17):
        zz=z-.31+j*.03875;xx=-4.82+.025*cos(j*pi/2)
        verts.extend([(xx,1.4,zz),(xx,4.7,zz)])
        if j:faces.append((2*j-2,2*j,2*j+1,2*j-1))
    mesh('Hanging cream split entrance curtain',verts,faces,cream)
rod('Entrance curtain rod',(-4.8,4.72,2.32),(-4.8,4.72,3.72),.025,black)

section('13 | fixed service furnishings')
# Narrow feeding station remains a furnishing, without bowls/toys/retail clutter.
for y in [.12,.65,1.2]:cube('Wall service shelf',(4.7,y,2.25),(.46,.045,1.75),wood,.009)
for z in [1.35,3.15]:rod('Service shelf frame',(4.65,.05,z),(4.65,1.35,z),.025,trim)
rod('Air purifier body',(4.28,.05,-4.9),(4.28,1.6,-4.9),.3,trim)
rod('Air purifier top vent',(4.28,1.6,-4.9),(4.28,1.63,-4.9),.28,black)

# Refine reference materials and keep the player sightline clear.
def refine_lounge(scene):
    import numpy as np
    # Move along the same threshold wall, keeping the established camera clear.
    scene.objects['09 | cream loveseat by sunroom opening'].location.x=-.8
    # One continuous top surface: overlapping shelf boards would shimmer in WebGL.
    for ob in list(scene.objects):
        if ob.name.startswith('Cabinet top edge') or (ob.name.startswith('Cubby vertical divider') and abs(ob.location.y-5.8)<.01):
            bpy.data.objects.remove(ob,do_unlink=True)
    rng=np.random.default_rng(27)
    for m in bpy.data.materials:
        iswood=m.name.startswith('Oak plank tone') or m.name in ['Pale oak furniture','Walnut cubby carcass']
        iscloth=any(word in m.name for word in ['fabric','upholstery','slipcover','petals'])
        if not (iswood or iscloth):continue
        w,h=(128,512) if iswood else (256,256)
        yy,xx=np.mgrid[0:h,0:w]
        if iswood:
            grain=np.sin(xx*.48+np.sin(yy*.012)*1.6)+.3*np.sin(xx*1.73+yy*.008)
            variation=1+grain*.052+rng.normal(0,.012,(h,w))
        else:
            variation=1+.025*np.sin(xx*pi)+.025*np.cos(yy*pi)+rng.normal(0,.016,(h,w))
        rgba=np.ones((h,w,4),dtype=np.float32)
        # Encode actual sRGB texels so both Blender and glTF sample the same colors.
        c=np.clip(np.asarray(m.diffuse_color[:3])[None,None,:]*variation[:,:,None],0,1)
        rgba[:,:,:3]=np.where(c<=.0031308,c*12.92,1.055*c**(1/2.4)-.055)
        name=m.name+' | subtle surface texture'
        old=bpy.data.images.get(name)
        if old:bpy.data.images.remove(old)
        im=bpy.data.images.new(name,width=w,height=h,alpha=False)
        im.colorspace_settings.name='sRGB';im.pixels.foreach_set(rgba.ravel());im.pack()
        node=m.node_tree.nodes.get('ReferenceSurface') or m.node_tree.nodes.new('ShaderNodeTexImage')
        node.name='ReferenceSurface';node.image=im
        m.node_tree.links.new(node.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    # The daisy has a broad visible seat surrounded by shallow petals.
    for ob in scene.objects:
        if ob.name.startswith('Flower petal cushion'):
            s=ob.scale.x/.36;ob.location.z=.13*s;ob.scale.z=.117*s
    # Lower power keeps the source preview close to the reference's warm neutral exposure.
    for ob in scene.objects:
        if ob.type=='LIGHT':ob.data.energy=1224 if ob.name.startswith('Soft window') else 504

refine_lounge(scene)

# User's annotated walkthrough establishes a right-hand, perpendicular window wing.
def correct_layout(scene):
    global group
    from mathutils import Matrix
    turn=Matrix.Translation((1.4,-2.5,0)) @ Matrix.Rotation(pi/2,4,'Z')
    sofa_turn=Matrix.Translation((-.4,-2.45,0)) @ Matrix.Rotation(-pi/2,4,'Z')
    # Rotate the actual three-dimensional rooms around the up axis, not the image.
    for name in ['10 | sunroom window drawer cabinets','11 | pair of window recliners','09 | cream loveseat by sunroom opening']:
        ob=scene.objects[name];ob.matrix_world=turn @ ob.matrix_world
        if name.startswith('11'):ob.location.y-=6.45
        if name.startswith('09'):ob.location.y+=.9
    ob=scene.objects['06 | olive sofa with tailored draped cushions'];ob.matrix_world=sofa_turn @ ob.matrix_world
    architecture=scene.objects['02 | architectural shell']
    for ob in list(architecture.children):
        if ob.name.startswith(('Sunroom opening','Window','Aluminum window','Blue sky','Distant')):
            ob.matrix_world=turn @ ob.matrix_world
        elif ob.name.startswith(('Side plaster wall','Skirting')) and ob.location.x>0:
            bpy.data.objects.remove(ob,do_unlink=True)
    tree_turn=Matrix.Translation((-2.6,.35,0)) @ turn
    for ob in list(scene.objects['12 | natural cat trees and entry curtain'].children):
        if -ob.location.y>4:ob.matrix_world=tree_turn @ ob.matrix_world
    for ob in scene.objects['13 | fixed service furnishings'].children:
        if ob.name.startswith(('Wall service shelf','Service shelf frame')):ob.location.y+=6.8
    for ob in scene.objects['08 | flower beds and rounded cat hideaway'].children:
        if ob.type!='MESH':continue
        center=sum((ob.matrix_world @ vv.co for vv in ob.data.vertices),Vector())/len(ob.data.vertices)
        if center.x>3 and -center.y>1:ob.location.x-=.85
    # The sofa's occasional table follows the sofa to the near wall.
    chairs=scene.objects['07 | lounge floor chairs and occasional tables']
    for ob in list(chairs.children):
        if ob.type=='MESH' and 2.1<ob.location.x<3.5:
            ob.matrix_world=sofa_turn @ ob.matrix_world
        elif ob.name.startswith('Table by green sofa'):
            ob.matrix_world=sofa_turn @ ob.matrix_world
    # Mesh-authored tabletop/contact geometry has an origin at zero.
    for ob in list(chairs.children):
        if ob.type!='MESH' or not ob.name.startswith('Soft furniture contact'):continue
        center=sum((ob.matrix_world @ vv.co for vv in ob.data.vertices),Vector())/len(ob.data.vertices)
        if 2.1<center.x<3.5 and -2.5<-center.y<-.8:ob.matrix_world=sofa_turn @ ob.matrix_world
    group=architecture
    cube('Main room near wall',(0,2.7,8.08),(10.2,5.4,.16),wall)
    cube('Near wall skirting',(0,.12,7.96),(10,.24,.05),trim,.008)
    for z,length in [(-5.25,5.5),(7.75,.5)]:
        cube('Right wall outside side opening',(5.08,2.7,z),(.16,5.4,length),wall)
        cube('Right wall outside opening skirting',(4.97,.12,z),(.055,.24,length),trim,.008)
    for z in [-2.58,7.58]:
        cube('Side wing return wall',(7.25,2.7,z),(4.5,5.4,.16),wall)
        cube('Side wing skirting',(7.25,.12,z+.11 if z<0 else z-.11),(4.5,.24,.055),trim,.008)
    group=scene.objects['01 | oak plank floor']
    cube('Right wing subfloor',(7.25,-.12,2.5),(4.5,.2,10),wood,0)
    for ix in range(9):
        x=5.25+ix*.5
        for iz in range(6):
            start=-2.5+iz*2+(ix%3)*.63;lo=max(-2.5,start-2);hi=min(7.5,start)
            if hi>lo:cube('Right wing oak board',(x,-.015,(lo+hi)/2),(.494,.03,hi-lo-.006),floorM[(ix+iz)%6],.003)
    group=scene.objects['03 | ceiling and track lights']
    for ix in range(3):
        for iz in range(5):cube('Right wing ceiling tile',(5.75+ix*1.5,5.43,-1.5+iz*2),(1.48,.1,1.98),trim,.005)
    for z in [-2.33,7.33]:cube('Right wing cove strip',(7.2,5.24,z),(4.4,.055,.055),glow,.005)
    cube('Window wing cove strip',(9.22,5.24,2.5),(.055,.055,9.6),glow,.005)
    section('14 | entry reception cabinet')
    cube('Entry storage carcass',(-4.2,.65,5.9),(1.4,1.3,2.5),trim,.025)
    cube('Entry oak worktop',(-4.2,1.33,5.9),(1.5,.06,2.6),wood,.025)
    for z in [5.3,6.5]:cube('Entry cabinet door',(-3.48,.66,z),(.045,1.15,1.15),cream,.012)
    # Shift the pre-existing reference lights if correcting an already saved scene.
    for ob in scene.objects:
        if ob.type=='LIGHT' and ob.name.startswith('Soft window'):ob.matrix_world=turn @ ob.matrix_world
    scene['layoutRevision']='Right wing, 90 degree turn from poster; user annotated reference'
    bpy.context.view_layer.update()

correct_layout(scene)

# Distinct window tree and a continuous soft drape from the close-up reference.
exec((ROOT/'scripts/lounge-furnishing-details.py').read_text(encoding='utf-8'))

# Two-seat entry arrangement, clear glass door and raised reference logo.
exec((ROOT/'scripts/lounge-entry-details.py').read_text(encoding='utf-8'))

# Sunroom sofas face the window, backed by a large transparent dividing wall.
exec((ROOT/'scripts/lounge-sunroom-layout.py').read_text(encoding='utf-8'))

# Clear exterior glass and a city with depth; device-time sky is animated in game.
exec((ROOT/'scripts/lounge-window-exterior.py').read_text(encoding='utf-8'))

# Extend the entry span and add the projecting wall and separately rotating wheel.
exec((ROOT/'scripts/lounge-depth-wheel.py').read_text(encoding='utf-8'))

# Correct the feeding shelf onto the broad wall facing the room.
exec((ROOT/'scripts/lounge-feeding-shelf.py').read_text(encoding='utf-8'))

# Save editable source before batching runtime meshes.
bpy.context.view_layer.update()
def camera(name,pos,target,lens=25):
    data=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,data);scene.collection.objects.link(o)
    o.location=v(pos);o.rotation_euler=(v(target)-o.location).to_track_quat('-Z','Y').to_euler();data.lens=lens
    return o
scene.camera=camera('Lounge reference view',(1.4,3.15,2.65),(-.3,1.7,-3.4),19)
camera('Window seating view',(4.2,3.2,3.5),(8.4,1.8,2.5),19)
camera('Sunroom glass and outward seating',(7.9,3.2,-1.9),(6.8,1.6,3.5),20)
camera('Right turn from poster',(0,2.3,4.8),(8,2.6,4.8),18)
camera('Cat-eye gameplay view',(0,1.65,4.8),(0,.45,-1.2),26)
camera('Hollow pod detail',(.75,2.8,-5.65),(0,.75,-7.05),46)
camera('Entry sofa door and logo',(1.5,2.65,-.4),(-2.4,2.25,7.2),22)
camera('Raised logo detail',(-4.7,3.2,4.6),(-7.77,3.25,5.9),48)
camera('Expanded entry and exercise wheel',(1.5,2.5,.7),(-2.2,1.55,6.7),22)
camera('Projecting sunroom approach wall',(-2.8,2.8,4),(2.4,2.2,-2.1),22)
camera('Feeding shelf speaker and cat photos',(2.5,2.35,3.1),(3.2,.9,-.8),38)

def area(name,p,target,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power*.72;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=v(p);ob.rotation_euler=(v(target)-ob.location).to_track_quat('-Z','Y').to_euler()
area('Soft window daylight',(8.9,4.5,2.5),(-.6,1,2.5),1700,7)
area('Window wing ceiling light',(7.2,5.1,2.5),(7.2,0,2.5),700,4)
for z in [-5,-.5,4]:area('Ceiling bounced light',(0,5.15,z),(0,0,z),700,5)
area('Entry vestibule fill',(-4.6,3.25,8.75),(-4.6,1,8.4),90,1.2)
for z in [-5,-.5,4]:area('Extended room ceiling fill',(-5.8,5.15,z),(-5.8,0,z),450,4)
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
for area_ui in bpy.context.screen.areas:
    if area_ui.type=='VIEW_3D':
        area_ui.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'lounge.blend'))

# Material batches dramatically reduce draw calls; editable source stays unmerged.
deps=bpy.context.evaluated_depsgraph_get();batches={}
for ob in list(scene.objects):
    if ob.type!='MESH':continue
    evaluated=ob.evaluated_get(deps);me=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps)
    copy=bpy.data.objects.new(ob.name+' export',me);scene.collection.objects.link(copy);copy.matrix_world=ob.matrix_world.copy()
    material_name=ob.data.materials[0].name if ob.data.materials else 'None'
    is_rotor=ob.parent and ob.parent.get('catWheelRotor',False)
    key=('wheel:' if is_rotor else '')+material_name;batches.setdefault(key,[]).append(copy)
export_objs=[]
for key,objects in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects:ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    merged=bpy.context.object;merged.name='Lounge | '+key
    transform=merged.matrix_world.copy()
    merged.parent=drum if key.startswith('wheel:') else root
    merged.matrix_world=transform;export_objs.append(merged)
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
drum.select_set(True)
for ob in export_objs:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/lounge.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in export_objs)
(OUT/'model-stats.json').write_text(json.dumps({'meshes':len(export_objs),'triangles':triangles,'materials':len(batches),'glbBytes':(ROOT/'public/models/lounge.glb').stat().st_size},indent=2))
# Remove transient export copies before render to prevent doubled surfaces.
for ob in export_objs:bpy.data.objects.remove(ob,do_unlink=True)
if args.export_only:
    print('LOUNGE_COMPLETE',triangles,'triangles;',len(batches),'material batches; export only')
    sys.exit(0)
scene.render.filepath=str(ART/'lounge-main.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Right turn from poster'];scene.render.filepath=str(ART/'lounge-right-turn.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Window seating view'];scene.render.filepath=str(ART/'lounge-window.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Sunroom glass and outward seating'];scene.render.filepath=str(ART/'sunroom-glass-seating.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Hollow pod detail'];scene.render.filepath=str(ART/'hollow-pod.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Entry sofa door and logo'];scene.render.filepath=str(ART/'lounge-entry.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Raised logo detail'];scene.render.filepath=str(ART/'lounge-logo.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Expanded entry and exercise wheel'];scene.render.filepath=str(ART/'lounge-wheel.png');bpy.ops.render.render(write_still=True)
scene.camera=scene.objects['Projecting sunroom approach wall'];scene.render.filepath=str(ART/'sunroom-approach-wall.png');bpy.ops.render.render(write_still=True)
print('LOUNGE_COMPLETE',triangles, 'triangles;',len(batches),'material batches')
