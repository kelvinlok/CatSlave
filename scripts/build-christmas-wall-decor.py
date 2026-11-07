"""Blender-authored natural holiday wall kit, in the lounge's authored world coordinates.
Run: blender --background --factory-startup --python scripts/build-christmas-wall-decor.py
Source units are game X/right,Y/up,Z; conversion to Blender is (X,-Z,Y).
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/christmas-wall-decor'; ART=ROOT/'artifacts/wall-decor'
OUT.mkdir(parents=True,exist_ok=True); ART.mkdir(parents=True,exist_ok=True)
random.seed(251224)
scene=bpy.data.scenes.new('Natural Christmas wall decorations'); bpy.context.window.scene=scene
scene.unit_settings.system='METRIC'
def v(p): return Vector((p[0],-p[2],p[1]))
def linear(x): return x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4
materials={}
for name,color,rough,metal,glow in [('Pine shadow','163d2d',.84,0,0),('Pine needles','2d6144',.75,0,0),('Pine tips','527b47',.8,0,0),('Holly','24513b',.46,0,0),('Leaf veins','719357',.65,0,0),('Twig','65513a',.9,0,0),('Cranberry cloth','a42c41',.92,0,0),('Cream knit','f3e8d1',.98,0,0),('Berry red','b72c35',.3,.05,0),('Antique gold','c9a461',.33,.6,0),('Warm bulbs','ffe6b2',.4,0,2.5)]:
    m=bpy.data.materials.new(name);m.use_nodes=True
    c=tuple(linear(int(color[i:i+2],16)/255) for i in (0,2,4));m.diffuse_color=(*c,1)
    bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    bs.inputs['Emission Color'].default_value=(*c,1);bs.inputs['Emission Strength'].default_value=glow
    if name in ['Cranberry cloth','Cream knit']:
        noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=220;noise.inputs['Detail'].default_value=2
        bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.009
        m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    materials[name]=m

# Direct material buckets avoid thousands of object operators and keep the GLB small.
buckets={}; component=''
def add(mat,verts,faces):
    key=(component,mat); b=buckets.setdefault(key,[[],[]]);n=len(b[0]);b[0].extend([tuple(v(p)) for p in verts]);b[1].extend([tuple(n+i for i in f) for f in faces])
def tube(points,radius,mat,sides=5):
    points=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(points):
        axis=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        ref=Vector((0,1,0)) if abs(axis.y)<.9 else Vector((1,0,0));u=axis.cross(ref).normalized();w=axis.cross(u).normalized()
        for j in range(sides):
            a=j/sides*math.tau;verts.append(p+radius*(u*math.cos(a)+w*math.sin(a)))
            if i: faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    add(mat,verts,faces)
def ball(p,r,mat):
    p=Vector(p);verts=[];faces=[];n=6;rows=4
    for i in range(rows+1):
        lat=i/rows*math.pi
        for j in range(n):
            a=j/n*math.tau;verts.append(p+Vector((math.sin(lat)*math.cos(a),math.cos(lat),math.sin(lat)*math.sin(a)))*r)
            if i: faces.append(((i-1)*n+j,(i-1)*n+(j+1)%n,i*n+(j+1)%n,i*n+j))
    add(mat,verts,faces)
def basis(normal):
    normal=Vector(normal);up=Vector((0,1,0));return up.cross(normal).normalized(),up,normal
def at(p,u,w,n,x,y,z=0):return Vector(p)+u*x+w*y+n*z

def sprig(p,d,n,size):
    p=Vector(p);d=Vector(d).normalized();n=Vector(n).normalized();side=n.cross(d).normalized()
    tip=p+d*size+n*.015
    tube([p,p+d*size*.5+n*.012,tip],.003,'Twig',3)
    for j in range(9):
        t=(j+.4)/9;start=p+d*size*t+n*.008
        for sign in [-1,1]:
            length=size*(.32+.14*random.random())*(1-.5*t)
            end=start+side*(sign*length)+d*length*.55+n*random.uniform(.004,.027)
            ridge=(start+end)*.5+n*.008
            width=.014*(1-.45*t)
            add(random.choice(['Pine needles','Pine needles','Pine tips','Pine shadow']),[start,end,ridge+side*width,ridge-side*width],[(0,2,1),(0,1,3)])
    # Four upward-facing needle tufts make volume visible at an oblique camera.
    for j in range(4):
        start=p+d*size*(j+.5)/5;end=start+d*.045+n*size*.24
        add('Pine tips',[start-side*.006,start+side*.006,end],[(0,1,2)])

def holly(p,d,n,size):
    p=Vector(p);d=Vector(d).normalized();n=Vector(n).normalized();side=n.cross(d).normalized()
    verts=[];faces=[];rows=8
    for i in range(rows+1):
        t=i/rows;center=p+d*size*t+n*(math.sin(t*math.pi)*.018+t*t*.02)
        width=math.sin(math.pi*t)*size*(.24 if i%2 else .34)
        verts.extend([center-side*width-n*width*.33,center+n*.008,center+side*width-n*width*.33])
        if i:
            k=i*3;faces.extend([(k-3,k,k+1,k-2),(k-2,k+1,k+2,k-1)])
    add('Holly',verts,faces)
    tube([p+n*.009,p+d*size*.5+n*.03,p+d*size+n*.025],.0025,'Leaf veins',3)

def greenery(p,u,up,n,index,scale=1):
    # Opposing branchlets sweep along the rope, rather than repeated leaf blobs.
    for sign in [-1,1]:
        d=(u*random.uniform(.2,.5)+up*sign*random.uniform(.5,.9)+n*random.uniform(-.1,.2)).normalized()
        sprig(Vector(p)+u*random.uniform(-.04,.04),d,n,random.uniform(.17,.24)*scale)
    sprig(Vector(p)-u*.08+n*.026,u+up*random.uniform(-.25,.25),n,.23*scale)
    if index%4==0:
        for sign in [-1,1]: holly(Vector(p)+n*.035,u*.6+up*sign*.6,n,random.uniform(.11,.16)*scale)
    if index%13==4:
        for a in [0,2.2,4.2]:ball(Vector(p)+n*.06+u*math.cos(a)*.025+up*math.sin(a)*.025,.022*scale,'Berry red')

def garland(name,start,end,swags,sag):
    global component;component=name
    a=Vector(start);b=Vector(end);length=(b-a).length
    normal=(1,0,0) if a.x==b.x and a.x<0 else (-1,0,0) if a.x==b.x else (0,0,-1) if a.z>0 else (0,0,1)
    u,up,n=basis(normal);points=[];count=math.ceil(length/.18)
    for i in range(count+1):
        t=i/count;p=a.lerp(b,t);p.y-=abs(math.sin(t*swags*math.pi))*sag;points.append(p)
        greenery(p,u,up,n,i)
        if i%4==0:ball(p+n*.07-up*.07,.022,'Warm bulbs')
    tube(points,.007,'Pine shadow',5)

def bow(p,size,normal):
    u,up,n=basis(normal);p=Vector(p)
    # A folded ribbon loop, with transverse cupping and a pinched center.
    for sign in [-1,1]:
        verts=[];faces=[];steps=20
        for i in range(steps+1):
            t=i/steps;theta=t*math.tau
            x=sign*size*.29*(1-math.cos(theta));y=math.sin(theta)*size*.18;depth=math.sin(theta)*size*.12
            width=size*(.055+.07*math.sin(math.pi*t)**2)
            for j in range(3):verts.append(at(p,u,up,n,x,y+(j-1)*width,depth+(.01 if j==1 else 0)))
            if i:
                k=i*3;faces.extend([(k-3,k,k+1,k-2),(k-2,k+1,k+2,k-1)])
        add('Cranberry cloth',verts,faces)
        verts=[];faces=[]
        for i in range(10):
            t=i/9
            for j in range(3):verts.append(at(p,u,up,n,sign*size*(.07+.18*t)+(j-1)*size*.09,-size*.65*t+(size*.08 if i==9 and j==1 else 0),size*.04*math.sin(t*math.pi*2)+(j==1)*.01))
            if i:
                k=i*3;faces.extend([(k-3,k,k+1,k-2),(k-2,k+1,k+2,k-1)])
        add('Cranberry cloth',verts,faces)
    ball(p+n*.025,size*.085,'Cranberry cloth')

def wreath(p,r,turn):
    global component;component='Evergreen wreath '+str(p)
    normal=(math.sin(turn),0,math.cos(turn));u,up,n=basis(normal);p=Vector(p)
    rope=[];count=48
    for i in range(count+1):
        a=i/count*math.tau;radial=u*math.cos(a)+up*math.sin(a);tangent=-u*math.sin(a)+up*math.cos(a);point=p+radial*r;rope.append(point)
        if i<count:
            for layer in [-1,1]:
                sprig(point+radial*layer*r*.035+n*random.uniform(.015,.04),tangent*.8+radial*layer*.6,n,r*random.uniform(.32,.43))
            if i%4==0:holly(point+n*.055,tangent*.65+radial*.6,n,r*.3)
            if i%9==0:
                for j in range(3):ball(point+n*.075+tangent*(j-1)*.03+radial*(j%2)*.025,r*.039,'Berry red')
    tube(rope,.009,'Twig',5)
    bow(p-up*r*.82+n*.12,r*.75,normal)

def stocking(p,index):
    global component;component='Hanging stocking '+str(index);p=Vector(p)
    u,up,n=basis((0,0,1));tilt=[-.055,.035,-.035][index]
    def transform(q):
        x,y,z=q;return at(p,u,up,n,x*math.cos(tilt)-y*math.sin(tilt),x*math.sin(tilt)+y*math.cos(tilt),z)
    path=[(0,.19,.126,.052),(-.006,.12,.124,.058),(-.01,.04,.12,.061),(-.018,-.045,.114,.061),(-.021,-.13,.112,.06),(-.012,-.205,.109,.059),(.02,-.27,.102,.06),(.075,-.31,.09,.062),(.14,-.321,.083,.06),(.205,-.315,.076,.055),(.255,-.3,.058,.043),(.282,-.29,.028,.024),(.289,-.285,.005,.006)]
    smooth=[]
    for i in range(len(path)-1):
        a=Vector(path[max(0,i-1)]);b=Vector(path[i]);c=Vector(path[i+1]);d=Vector(path[min(len(path)-1,i+2)])
        for t in [0,.25,.5,.75]:smooth.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
    path=smooth+[path[-1]]
    verts=[];faces=[];sides=32
    for i,(x,y,r,depth) in enumerate(path):
        before=path[max(0,i-1)];after=path[min(len(path)-1,i+1)];tangent=Vector((after[0]-before[0],after[1]-before[1])).normalized();side=Vector((-tangent.y,tangent.x))
        for j in range(sides):
            a=j/sides*math.tau;fold=1+.035*math.sin(a*5+i*.9)+.018*math.sin(a*9-i*.6)
            xx=x+side.x*r*math.cos(a)*fold;yy=y+side.y*r*math.cos(a)*fold
            # Sewn cloth buckles in diagonal ridges above the ankle and beneath cuff.
            envelope=math.exp(-((yy+.16)/.115)**2)+.65*math.exp(-((yy-.075)/.055)**2)
            wrinkle=.016*envelope*math.sin(70*(yy+xx*.34)+index*.65)*abs(math.sin(a))**3
            verts.append(transform((xx,yy,depth*math.sin(a)*fold+.015+wrinkle)))
            if i:faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    add('Cranberry cloth',verts,faces)
    # Rolled cuff: knitted ribs follow its curved elliptical opening, not a box.
    cuff=[]
    for j in range(49):
        a=j/48*math.tau;cuff.append(transform((.129*math.cos(a),.157,.061*math.sin(a)+.015)))
    tube(cuff,.036,'Cream knit',8)
    for j in range(32):
        a=j/32*math.tau;points=[]
        for k in range(9):
            t=k/8*math.pi;points.append(transform(((.13+.033*math.sin(t))*math.cos(a),.157+.033*math.cos(t),(.061+.028*math.sin(t))*math.sin(a)+.015)))
        tube(points,.0035,'Cream knit',4)
    # Two running seam stitches down the sides and around the toe.
    for sign in [-1,1]:
        for i in range(len(path)-2):
            x,y,r,d=path[i];x2,y2,r2,d2=path[i+1]
            tube([transform((x+sign*r*.82,y,.044)),transform((x*.6+x2*.4+sign*(r*.6+r2*.4)*.82,y*.6+y2*.4,.046))],.0021,'Cream knit',3)
    loop=[transform((-.095+.026*math.cos(a),.225+.055*math.sin(a),.012)) for a in [i/24*math.tau for i in range(25)]]
    tube(loop,.009,'Cranberry cloth',5)
    # Small stitched holly appliqué rather than a rigid metal emblem.
    for sign in [-1,1]:holly(transform((0,-.07,.078)),u*sign*.55+up*.65,n,.07)
    for j in [-1,0,1]:ball(transform((j*.016,-.074,.083)),.009,'Berry red')

garland('Mural garland',(-6.12,4.49,-7.66),(.9,4.49,-7.66),3,.3)
garland('Cubby fairy lights',(-6.35,3.55,-7.35),(-6.35,3.55,-.55),3,.23)
for x in [-5.7,-3.35,-.95]:component='Mural bows';bow((x,4.24,-7.57),.32,(0,0,1))
wreath((1.16,2.7,-3.6),.66,-math.pi/2)
garland('Right wall garland',(1.14,4.15,-7.6),(1.14,4.15,-1.5),3,.28)
garland('Feeding shelf trim',(1.65,1.28,-.57),(4.75,1.28,-.57),3,.12)
for i,x in enumerate([2.1,3.2,4.3]):stocking((x,2.85,-1.035),i)
garland('Feeding wall garland',(1.65,3.22,-1.02),(4.75,3.22,-1.02),2,.15)
wreath((-4.6,4.1,7.86),.43,math.pi)
garland('Entry garland',(-7.5,4.78,7.75),(4.65,4.78,7.75),5,.23)
garland('Sunroom lights',(9.24,4.8,-2.2),(9.24,4.8,7.1),4,.22)
wreath((9.21,3.25,2.3),.48,-math.pi/2)

source=bpy.data.collections.new('Editable decoration components');scene.collection.children.link(source)
export=bpy.data.collections.new('Runtime material batches');scene.collection.children.link(export)
objects=[]
for (name,mat),(verts,faces) in buckets.items():
    mesh=bpy.data.meshes.new(name+' / '+mat);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name+' / '+mat,mesh);source.objects.link(obj);obj.data.materials.append(materials[mat]);objects.append(obj)
    for face in mesh.polygons:face.use_smooth=True
source.hide_render=True;source.hide_viewport=True
exported=[]
for name,mat in materials.items():
    copies=[]
    for obj in objects:
        if obj.data.materials[0]!=mat:continue
        copy=obj.copy();copy.data=obj.data.copy();export.objects.link(copy);copies.append(copy)
    if not copies:continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=copies[0]
    if len(copies)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='WallDecor / '+name;exported.append(obj)
root=bpy.data.objects.new('NaturalChristmasWallDecor',None);export.objects.link(root)
for obj in exported:obj.parent=root
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for obj in exported:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/christmas-wall-decor.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True)

scene.world=bpy.data.worlds.new('Warm studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.42,.46,.43,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
for name,pos,energy,size,target in [('Stocking softbox',(3.2,4.5,2),350,4,(3.2,2.9,-1)),('Wreath softbox',(-2,4,-2),250,3,(1.16,2.7,-3.6))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=v(pos);obj.rotation_euler=(v(target)-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('Detail camera');camera=bpy.data.objects.new('Detail camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera;camera_data.type='ORTHO'
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
def render(filename,pos,target,span,width,height):
    camera.location=v(pos);camera.rotation_euler=(v(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.ortho_scale=span;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.filepath=str(ART/filename);bpy.ops.render.render(write_still=True)
render('stockings-garland.png',(3.45,3.3,3),(3.2,2.88,-1),3.5,1400,700)
render('wreath.png',(-2.2,2.95,-3.2),(1.16,2.7,-3.6),1.9,900,900)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'decor.blend'))
stats={'meshes':len(exported),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in exported),'components':sorted(set(key[0] for key in buckets)),'materials':[m.name for m in materials.values()]}
(ART/'model-stats.json').write_text(json.dumps(stats,indent=2));print(json.dumps(stats))
