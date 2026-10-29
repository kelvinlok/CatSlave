"""Author Dingding in Blender. Run with Blender --background --python this-file.

Coordinates in the authoring functions match the game's +Y-up, +Z-forward rig.
The Blender source is Z-up; the glTF exporter converts it back on export.
All surface and fur geometry is authored here; no remote assets are required.
"""
import bpy, math, random, os, json
from functools import lru_cache
import numpy as np
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, exp, sqrt

ROOT = Path(__file__).resolve().parents[1]
random.seed(9494)
(ROOT/'assets/dingding').mkdir(parents=True,exist_ok=True)
(ROOT/'artifacts/dingding-blender').mkdir(parents=True,exist_ok=True)
scene = bpy.data.scenes.new('Dingding • dense mackerel tabby photo study')
bpy.context.window.scene = scene
scene.world = bpy.data.worlds.new('Dingding studio world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.21,.26,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35

def v(p): return Vector((p[0],-p[2],p[1]))
def game(p): return (p[0],p[2],-p[1])
def linear(c): return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
@lru_cache(maxsize=None)
def rgb(h): return tuple(linear(int(h[i:i+2],16)/255) for i in (0,2,4))
# Four supplied photos: grey-brown mackerel tabby, small white bib/toes, green-gold eyes, short kinked tail.
BROWN=rgb('7b776c'); CREAM=rgb('eeeae1'); PINK=rgb('a76e59')
DARK=rgb('302f29'); TAN=rgb('a99a81')
INK=rgb('302c28'); GOLD=rgb('b9b24e')

def material(name, color=None, rough=.8, vertex=False):
    m=bpy.data.materials.new(name); m.diffuse_color=(*(color or (1,1,1)),1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*(color or (1,1,1)),1)
    bs.inputs['Roughness'].default_value=rough
    if vertex:
        attr=m.node_tree.nodes.new('ShaderNodeVertexColor'); attr.layer_name='Coat'
        m.node_tree.links.new(attr.outputs['Color'],bs.inputs['Base Color'])
    return m
coat=material('Dingding | short dense coat',rough=.91)
atlas=bpy.data.images.new('Dingding | painted coat atlas',width=2048,height=2048,alpha=True)
atlas_pixels=np.ones((2048,2048,4),dtype=np.float32)
normal_pixels=np.ones((2048,2048,4),dtype=np.float32)
normal_pixels[:,:,:3]=(.5,.5,1)
atlas_slots=set()
tex=coat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=atlas
coat.node_tree.links.new(tex.outputs['Color'],coat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
furmat=material('Dingding | tapered guard hairs',vertex=True,rough=.88)
furmat.use_backface_culling=False
eyeMat=material('Dingding | yellow-green iris',vertex=True,rough=.3)
eyeMat.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.45
noseMat=material('Dingding | soft pink leather',PINK,rough=.43)
darkMat=material('Dingding | mouth and lid',INK,rough=.68)
whiskerMat=material('Dingding | ivory whiskers',rgb('e7ded0'),rough=.65)

def empty(name,p=(0,0,0),parent=None):
    ob=bpy.data.objects.new(name,None); scene.collection.objects.link(ob)
    ob.parent=parent; ob.location=v(p); ob.empty_display_size=.08
    return ob
root=empty('Dingding_Blender'); root['source']='Blender authored Dingding native rig'; root['displayName']='丁丁'; root['references']='reference-front.png; reference-side.png; reference-tail.png; reference-walking.png'
parts={}
def part(name,p=(0,0,0),parent=root):
    parts[name]=empty(name,p,parent); return parts[name]
body=part('body'); head=part('head',(0,.99,.57))

def mesh(name,verts,faces,parent,mat=coat,paint=None):
    data=bpy.data.meshes.new(name); data.from_pydata([v(p) for p in verts],[],faces); data.update()
    ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob); ob.parent=parent
    data.materials.append(mat)
    for poly in data.polygons: poly.use_smooth=True
    if paint:
        attr=data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
        for i,p in enumerate(verts): attr.data[i].color=(*paint(*p),1)
    return ob

def paint_texture(ob,fn,paint,nu,nv,project=None):
    wide=ob.name.startswith(('Head •','Torso •'))
    span=2 if wide else 1;size=256*span
    slot=next(i for i in range(64) if i%8<=8-span and i//8<=8-span and not any(i+x+y*8 in atlas_slots for x in range(span) for y in range(span)))
    atlas_slots.update(slot+x+y*8 for x in range(span) for y in range(span))
    x0=(slot%8)*256;y0=(slot//8)*256
    # Padding protects atlas tiles from mipmap bleeding.
    rng=np.random.default_rng(100+slot)
    grain=rng.normal(0,1,(size,size))
    grain=(grain+np.roll(grain,1,axis=0)+np.roll(grain,2,axis=0)+np.roll(grain,3,axis=0))*.5
    dx=(np.roll(grain,-1,axis=1)-np.roll(grain,1,axis=1))*.18
    dy=(np.roll(grain,-1,axis=0)-np.roll(grain,1,axis=0))*.18
    nz=1/np.sqrt(dx*dx+dy*dy+1)
    normal_pixels[y0:y0+size,x0:x0+size,0]=.5-dx*nz*.5
    normal_pixels[y0:y0+size,x0:x0+size,1]=.5-dy*nz*.5
    normal_pixels[y0:y0+size,x0:x0+size,2]=.5+nz*.5
    # Antialias coat boundaries offline in linear colour, without enlarging
    # the atlas or adding shader work. Fine strand grain is applied afterward.
    samples=(-.25,.25) if paint in (headpaint,bodypaint) else (0,)
    sample_weight=1/(len(samples)**2)
    for y in range(size):
        for x in range(size):
            col=[0.,0.,0.]
            for sy in samples:
                t=max(0,min(1,(y+sy-3)/(size-7)))
                for sx in samples:
                    u=max(0,min(1,(x+sx-3)/(size-7)))
                    sample=paint(*fn(t,u))
                    for c in range(3):col[c]+=sample[c]*sample_weight
            # Fine aligned coat fibres provide coverage between silhouette hairs.
            factor=1+grain[y,x]*.075
            atlas_pixels[y0+y,x0+x,:3]=[min(1,c*factor) for c in col]
    uv=ob.data.uv_layers.new(name='CoatUV')
    for poly in ob.data.polygons:
        ids=[ob.data.loops[k].vertex_index for k in poly.loop_indices]
        cols=[i%nu for i in ids];wrap=max(cols)-min(cols)>nu/2
        for k in poly.loop_indices:
            idx=ob.data.loops[k].vertex_index;i=idx%nu;j=idx//nu
            u=1 if wrap and i==0 else i/nu
            vv=j/nv
            if project:u,vv=project(game(ob.data.vertices[idx].co))
            uv.data[k].uv=((x0+3+u*(size-7))/2048,(y0+3+vv*(size-7))/2048)

def shade(base,x,y,z,amount=.035):
    n=(sin(x*91+y*53+z*79)*sin(x*31-y*97+z*42)+sin(x*241+y*181+z*113)*.35)*amount
    return tuple(max(.001,min(1,c*(1+n))) for c in base)

def softmask(distance,width=.008):
    t=max(0,min(1,.5+distance/(2*width)))
    return t*t*(3-2*t)

def mixcoat(a,b,t):
    return tuple(x*(1-t)+y*t for x,y in zip(a,b))

def oval(x,z,cx,cz,rx,rz):
    # A signed approximation in scene units gives consistently soft coat edges.
    return (1-sqrt(((x-cx)/rx)**2+((z-cz)/rz)**2))*min(rx,rz)

def tabby(x,y,z):
    # Narrow broken mackerel stripes, ticked grey-brown field, dark spine.
    base=mixcoat(BROWN,TAN,softmask(.62-y,.18)*.30)
    phase=z*54+2.3*sin(y*12+z*2)+.85*sin(z*27+y*23)+.27*sin(z*71+y*35)
    stripes=softmask(sin(phase)-(.28+.18*sin(y*21-z*12)),.39)*softmask(abs(x)-.06,.045)
    broken=.48+.52*softmask(sin(y*29+z*19)+.3,.45)
    spine=softmask(y-.89,.05)*softmask(.060+.018*sin(z*19)-abs(x),.028)
    tick=(sin(x*330+y*191+z*270)*sin(y*83-z*165)+1)*.045
    return mixcoat(base,DARK,max(stripes*broken*.82,spine*.78,tick))

def bodypaint(x,y,z):
    # Small white throat/bib and belly; shoulders, flanks and legs stay tabby.
    bib=softmask(z-.47,.035)*softmask(.76-y,.055)*softmask(y-.38,.05)*softmask(.145-abs(x),.035)
    belly=softmask(.43-y,.035)*softmask(.17-abs(x),.045)
    return shade(mixcoat(tabby(x,y,z),CREAM,max(bib,belly)),x,y,z,.04)

def headpaint(x,y,z):
    front=softmask(z+.015,.055);ax=abs(x)
    base=mixcoat(BROWN,TAN,softmask(.17-y,.14)*.44)
    inner=.042+.15*(y-.075)+.007*sin(y*23)
    outer=.125+.25*(y-.08)+.006*sin(y*18)
    brow=max(softmask(.010-abs(ax-inner),.005),softmask(.012-abs(ax-outer),.006))*softmask(y-.075,.02)
    crown=softmask(sin(x*92+.8*sin(y*19))-.45,.22)*softmask(y-.205,.03)
    cheek1=softmask(.012-abs(y+.012+.32*ax),.006)*softmask(ax-.205,.015)
    cheek2=softmask(.012-abs(y+.069+.35*ax),.006)*softmask(ax-.19,.018)
    base=mixcoat(base,DARK,max(brow,crown,cheek1,cheek2)*front*.93)
    eye_r=sqrt(((ax-.166)/.078)**2+((y-.023)/.074)**2)
    surround=softmask(.10-abs(eye_r-1.05),.055)*front
    base=mixcoat(base,rgb('d9ceb2'),surround*.35)
    tear=softmask(.009-abs(ax-(.093-.22*y)),.004)*softmask(.016-y,.01)*softmask(y+.075,.015)*front
    base=mixcoat(base,DARK,tear*.88)
    # Warm uninterrupted nasal bridge: no white blaze, unlike Zhenzhenzi.
    nosebridge=softmask(.06-ax,.018)*softmask(.10-y,.04)*softmask(y+.115,.025)*front
    base=mixcoat(base,rgb('b4a185'),nosebridge*.55)
    muzzle=softmask(-.115-.12*ax-y,.017)*front
    chin=softmask(-.195-y,.014)
    base=mixcoat(base,CREAM,max(muzzle,chin))
    # Small follicle freckles around the white whisker pads.
    dots=0
    for side in (-1,1):
        for dx,dy in ((.060,-.112),(.086,-.127),(.114,-.115),(.135,-.143),(.078,-.150)):
            dots=max(dots,softmask(.0028-sqrt((x-side*dx)**2+(y-dy)**2),.0015))
    base=mixcoat(base,DARK,dots*front*.65)
    return shade(base,x,y,z,.04)

def tailpaint(x,y,z):
    rings=softmask(sin(y*57+.55*sin(y*18))-.08,.28)
    return shade(mixcoat(BROWN,DARK,max(rings*.89,softmask(y-.46,.025))),x,y,z,.035)

def uvshape(name,parent,fn,paint,nu=64,nv=40):
    verts=[];faces=[]
    for j in range(nv+1):
        t=pi*j/nv
        for i in range(nu): verts.append(fn(t,2*pi*i/nu))
    for j in range(nv):
        for i in range(nu):
            a=j*nu+i;b=j*nu+(i+1)%nu
            faces.append((a,a+nu,b+nu,b))
    ob=mesh(name,verts,faces,parent,paint=paint)
    # Winding is corrected from the signed volume rather than assuming parameter order.
    import bmesh
    bm=bmesh.new();bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    if paint:paint_texture(ob,lambda t,u:fn(t*pi,u*2*pi),paint,nu,nv)
    return ob

def ellipsoid(name,parent,center,scale,paint,nu=40,nv=24,mat=coat):
    ob=uvshape(name,parent,lambda t,a:(center[0]+scale[0]*sin(t)*cos(a),center[1]+scale[1]*cos(t),center[2]+scale[2]*sin(t)*sin(a)),paint if mat==coat else None,nu,nv)
    if paint and mat!=coat:
        attr=ob.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
        for j,vert in enumerate(ob.data.vertices):attr.data[j].color=(*paint(*game(vert.co)),1)
    ob.data.materials.clear();ob.data.materials.append(mat);return ob

def loft(name,parent,profile,axis,paint,steps=56,sides=48):
    # Cubic Hermite interpolation keeps shoulder and rump volumes continuous.
    def sample(t):
        k=min(len(profile)-2,int(t*(len(profile)-1))); f=t*(len(profile)-1)-k
        a=profile[k];b=profile[k+1];pre=profile[max(0,k-1)];post=profile[min(len(profile)-1,k+2)]
        return [((2*f**3-3*f*f+1)*a[d]+(f**3-2*f*f+f)*(b[d]-pre[d])*.5+(-2*f**3+3*f*f)*b[d]+(f**3-f*f)*(post[d]-a[d])*.5) for d in range(4)]
    verts=[];faces=[]
    for j in range(steps+1):
        along,rx,ry,offset=sample(j/steps)
        for i in range(sides):
            a=i*2*pi/sides
            verts.append((cos(a)*max(.001,rx),sin(a)*max(.001,ry)+offset,along) if axis=='z' else (cos(a)*max(.001,rx),along,sin(a)*max(.001,ry)+offset))
    for j in range(steps):
        for i in range(sides):
            a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
    ob=mesh(name,verts,faces,parent,paint=paint)
    import bmesh
    bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    def fn(t,u):
        along,rx,ry,offset=sample(t);a=u*2*pi
        return (cos(a)*max(.001,rx),sin(a)*max(.001,ry)+offset,along) if axis=='z' else (cos(a)*max(.001,rx),along,sin(a)*max(.001,ry)+offset)
    paint_texture(ob,fn,paint,sides,steps)
    return ob

def fur(ob,count,length=.016,flow=(0,-1,-.15),paint=None):
    """Tapered bent ribbons conform to the surface and export as ordinary mesh."""
    import bisect
    ob.data.calc_loop_triangles(); tris=list(ob.data.loop_triangles)
    totals=[]; total=0
    for tri in tris: total+=tri.area;totals.append(total)
    verts=[];faces=[];cols=[]
    for _ in range(count):
        tri=tris[min(len(tris)-1,bisect.bisect_left(totals,random.random()*total))]
        a,b,c=[ob.data.vertices[i] for i in tri.vertices]
        r=sqrt(random.random());s=random.random();w=(1-r,r*(1-s),r*s)
        p=a.co*w[0]+b.co*w[1]+c.co*w[2];n=(a.normal*w[0]+b.normal*w[1]+c.normal*w[2]).normalized()
        g=Vector(flow);f=v(g); tangent=f-n*f.dot(n)
        if tangent.length<.01:tangent=n.cross(Vector((1,0,0)))
        tangent.normalize();direction=(n*.38+tangent*.92).normalized()
        side=n.cross(direction).normalized(); L=length*.58*random.uniform(.6,1.4);width=L*random.uniform(.025,.055)
        p+=n*.0015;mid=p+direction*L*.55+n*L*.1;tip=p+direction*L+n*L*.08
        points=[p-side*width,p+side*width,mid+side*width*.48,mid-side*width*.48,tip]
        idx=len(verts);verts.extend([game(q) for q in points]);faces.extend([(idx,idx+1,idx+2,idx+3),(idx+3,idx+2,idx+4)])
        base=(paint or (lambda x,y,z:BROWN))(*game(p)); factor=random.uniform(.75,1.30)
        cols.extend([tuple(min(1,x*factor) for x in base)]*5)
    result=mesh(ob.name+' • fur',verts,faces,ob.parent,furmat)
    attr=result.data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    for i,col in enumerate(cols):attr.data[i].color=(*col,1)
    return result

torso=loft('Torso • shoulder, ribcage & haunch',body,[(-.87,.008,.008,.68),(-.73,.215,.255,.69),(-.50,.31,.29,.68),(-.15,.282,.27,.67),(.18,.267,.28,.68),(.40,.265,.31,.69),(.59,.18,.24,.77),(.70,.007,.01,.82)],'z',bodypaint)
fur(torso,6000,.018,flow=(0,-.6,-1),paint=bodypaint)

# Head silhouette is shaped with jowls, tapered crown, eye sockets and nasal bridge.
def headshape(t,a):
    nx=sin(t)*cos(a);ny=cos(t);nz=sin(t)*sin(a)
    cheek=1+.08*exp(-((ny+.35)/.34)**2)
    x=nx*.316*cheek;y=ny*.31;z=nz*.277
    if y>.18:y=.18+(y-.18)*.78
    if nz>0:
        z+=.024*exp(-((ny+.4)/.4)**2)*nz
        for side in [-1,1]:
            socket=exp(-(((x-side*.166)/.095)**2+((y-.023)/.083)**2)*1.8)
            z-=.018*socket
        z+=.024*exp(-(x/.065)**2-((y+.05)/.19)**2)
    return (x,y,z)
skull=uvshape('Head • sculpted cheeks and eye sockets',head,headshape,headpaint,96,64)
headpieces=[skull]
for side in [-1,1]:
    muzzle=ellipsoid('Muzzle • whisker pad',head,(side*.078,-.132,.275),(.108,.071,.082),headpaint,48,28)
    headpieces.append(muzzle)
chin=ellipsoid('Chin • white short coat',head,(.004,-.219,.225),(.119,.046,.072),headpaint,48,24)
headpieces.append(chin)
bpy.ops.object.select_all(action='DESELECT')
for o in headpieces:o.select_set(True)
bpy.context.view_layer.objects.active=skull;bpy.ops.object.join()
remesh=skull.modifiers.new('Continuous feline muzzle sculpt','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.007;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=skull.modifiers.new('Soft tissue transitions','SMOOTH');smooth.factor=1.0;smooth.iterations=5
bpy.ops.object.modifier_apply(modifier=smooth.name)
dec=skull.modifiers.new('Game surface topology','DECIMATE');dec.ratio=.62
bpy.ops.object.modifier_apply(modifier=dec.name)
for layer in list(skull.data.uv_layers):skull.data.uv_layers.remove(layer)
for poly in skull.data.polygons:poly.use_smooth=True
paint_texture(skull,lambda t,u:((u-.5)*.9,t*.64-.32,.3),headpaint,1,1,project=lambda p:((p[0]/.9)+.5,(p[1]+.32)/.64))
frontUV=[loop.uv.copy() for loop in skull.data.uv_layers.active.data]
def backpaintpoint(t,u):
    # Reconstruct the rear surface depth so crown and neck meet across the UV seam.
    x=(u-.5)*.9;y=t*.64-.32
    ny=((y-.18)/.78+.18 if y>.18 else y)/.31
    cheek=1+.08*exp(-((ny+.35)/.34)**2)
    z=-.277*sqrt(max(0,1-(x/(.316*cheek))**2-ny**2))
    return (x,y,z)
paint_texture(skull,backpaintpoint,headpaint,1,1,project=lambda p:((p[0]/.9)+.5,(p[1]+.32)/.64))
backUV=skull.data.uv_layers[-1]
for poly in skull.data.polygons:
    if game(poly.center)[2]>=0:
        for li in poly.loop_indices:backUV.data[li].uv=frontUV[li]
skull.data.uv_layers.remove(skull.data.uv_layers[0])
fur(skull,4800,.014,flow=(0,-1,-.18),paint=headpaint)

def tube(name,parent,pts,radius,mat,paint=None,sides=6,steps=20):
    # Bezier cubic or quadratic path, with taper to a fine tip.
    verts=[];faces=[]
    for j in range(steps+1):
        t=j/steps
        def point(t):
            if len(pts)==3:return Vector(pts[0])*(1-t)**2+Vector(pts[1])*2*t*(1-t)+Vector(pts[2])*t*t
            return Vector(pts[0])*(1-t)**3+Vector(pts[1])*3*t*(1-t)**2+Vector(pts[2])*3*t*t*(1-t)+Vector(pts[3])*t**3
        p=point(t);direction=(point(min(1,t+.005))-point(max(0,t-.005))).normalized()
        side=direction.cross(Vector((0,1,0)))
        if side.length<.01:side=direction.cross(Vector((1,0,0)))
        side.normalize();other=direction.cross(side).normalized()
        r=radius*(1-.9*t) if 'whisker' in name.lower() else radius
        for i in range(sides):verts.append(tuple(p+(side*cos(i*2*pi/sides)+other*sin(i*2*pi/sides))*r))
    for j in range(steps):
        for i in range(sides):a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
    return mesh(name,verts,faces,parent,mat,paint)

for i,side in enumerate([-1,1]):
    ear=part('ear'+str(i),(side*.23,.145,-.025),head)
    # Photo-front viewer-left upper ear folds outward and slightly down; right stays taller.
    height=.325 if side<0 else .36
    lean=.11 if side<0 else .085
    def earshape(t,a,side=side,height=height,lean=lean):
        u=(1+cos(t))*.5
        width=.112*(1-u)**.72
        fold=u**4 if side<0 else 0
        return (sin(a)*width+side*(u*lean+.070*fold),u*height-.045*fold,cos(a)*(.026+.022*(1-u))*sqrt(1-u)+.018*sin(u*pi)-max(0,cos(a))*.014*sin(u*pi))
    def earpaint(x,y,z):
        u=max(0,min(1,y/height));axis=side*u*lean
        inner=softmask(z-.017,.006)*softmask(.094*(1-u)**.65-abs(x-axis),.009)*softmask(.93-u,.025)
        inner_colour=mixcoat(rgb('e4ded2'),rgb('cda9a4'),softmask(u-.19,.11))
        outer=mixcoat(BROWN,DARK,softmask(u-.94,.025)*.7)
        return shade(mixcoat(outer,inner_colour,inner),x,y,z,.03)
    shell=uvshape('Ear • intact pointed '+str(i),ear,earshape,earpaint,44,34)
    shell['referenceFeature']='viewer-left folded upper ear, taller right ear, pale pink interiors'
    fur(shell,650,.014,flow=(side*.3,1,0),paint=earpaint)
    for n in range(6):
        y=.045+n*.017
        tube('Ear furnishing whisker',ear,[(side*.04,y,.043),(side*.015,y+.040,.055),(side*.055,y+.065,.035)],.00065,whiskerMat,sides=3,steps=6)
    eye=part('eye'+str(i),(side*.166,.023,.286),head)
    # Dark outer limbus, radially striated yellow-green iris, deep pupil and wet highlights.
    def irispaint(x,y,z):
        r=sqrt((x/.073)**2+(y/.078)**2);a=math.atan2(y/.078,x/.073)
        if r>.94:return rgb('3f3d2b')
        stripe=(sin(a*71+sin(r*35)*.8)+sin(a*119+r*16))*.10
        base=GOLD
        return tuple(min(1,c*(.82+.24*r+stripe)) for c in base)
    iris=ellipsoid('Eye • yellow-green radial iris',eye,(0,0,0),(.074,.079,.023),irispaint,64,36,eyeMat)
    pupil=ellipsoid('Eye • vertical pupil',eye,(0,.002,.022),(.034,.052,.007),lambda *p:rgb('090c0b'),40,24,eyeMat)
    tube('Eye • upper lid',eye,[(-.079,-.004,0),(-.068,.103,-.008),(.055,.101,-.012),(.079,.001,-.005)],.0038,darkMat,sides=8,steps=24)
    tube('Eye • lower lid',eye,[(-.079,-.004,0),(-.044,-.091,-.002),(.059,-.082,-.008),(.079,.001,-.005)],.003,darkMat,sides=6,steps=22)
    shine=material('Eye catchlight '+str(i),rgb('f9f5e7'),.12)
    ellipsoid('Eye • catchlight',eye,(-.018,.032,.028),(.011,.016,.003),None,20,14,shine)
    ellipsoid('Eye • secondary reflection',eye,(.028,-.032,.023),(.004,.006,.002),None,16,10,shine)
    for child in eye.children:
        if child.type=='MESH':
            for vert in child.data.vertices:
                p=game(vert.co);xx=p[0]*.88;yy=p[1]*.94*(1-.08*min(1,abs(p[0])/.079));angle=side*.10
                vert.co=v((xx*cos(angle)-yy*sin(angle),xx*sin(angle)+yy*cos(angle),p[2]-.061))
    closed=part('closedEye'+str(i),(side*.166,.023,.251),head)
    tube('Closed lid',closed,[(-.071,-.002,0),(0,.016,.012),(.071,-.002,0)],.006,darkMat,sides=6,steps=20)
    closed.hide_render=True;closed.hide_viewport=True
    for k in range(8):
        y=-.105-k*.013;x=side*(.072+(k%3)*.025)
        tube('Whisker '+str(i)+' '+str(k),head,[(x,y,.349),(side*.26,y+.025-k*.006,.40),(side*(.51+.035*sin(k)),y+.10-k*.028,.30)],.00115,whiskerMat,sides=4,steps=14)
    for k in range(3):
        tube('Brow whisker',head,[(side*(.15+k*.025),.16,.24),(side*.25,.34,.29),(side*(.27+k*.03),.40+.02*k,.20)],.00075,whiskerMat,sides=3,steps=12)

# Rounded triangular nose with alar wings, nostrils and a short philtrum.
nose=mesh('Nose • heart shaped leather',[(-.042,-.078,.348),(-.026,-.066,.359),(0,-.071,.366),(.026,-.066,.359),(.042,-.078,.348),(.026,-.097,.357),(0,-.119,.361),(-.026,-.097,.357),(0,-.085,.371)],[(0,1,8),(1,2,8),(2,3,8),(3,4,8),(4,5,8),(5,6,8),(6,7,8),(7,0,8)],head,noseMat)
sub=nose.modifiers.new('Soft nose edges','SUBSURF');sub.levels=2
bpy.context.view_layer.objects.active=nose;bpy.ops.object.modifier_apply(modifier=sub.name)
for side in [-1,1]:
    tube('Nostril',head,[(side*.025,-.084,.364),(side*.036,-.080,.357),(side*.032,-.092,.360)],.0025,darkMat,sides=6,steps=8)
    tube('Mouth seam',head,[(0,-.151,.348),(side*.033,-.172,.345),(side*.083,-.148,.335)],.0018,darkMat,sides=5,steps=14)
tube('Philtrum',head,[(0,-.118,.362),(0,-.136,.355),(0,-.151,.348)],.0018,noseMat,sides=5,steps=12)

for i in range(4):
    side=1 if i%2 else -1;front=i<2
    leg=part('leg'+str(i),(side*.245,.57,.40 if front else -.62))
    def limbpaint(x,y,z):
        base=mixcoat(BROWN,TAN,.38)
        bars=softmask(sin(y*47+.95*sin(z*19+x*11)+x*8)-(.28+.18*sin(z*31)),.39)
        return shade(mixcoat(base,DARK,bars*(.65+.16*sin(x*31+y*17)**2)),x,y,z,.04)
    def legpaint(x,y,z,i=i):
        return limbpaint(x,y,z)
    upper=loft('Forearm' if front else 'Muscular thigh',leg,[(-.29,.073,.08,0),(-.21,.095 if front else .12,.115,-.012),(-.07,.115 if front else .166,.132 if front else .183,0),(.12,.06,.09,0)],'y',legpaint,32,32)
    fur(upper,700,.014,paint=legpaint)
    lower=part('lowerLeg'+str(i),(0,-.25,0),leg)
    def lowpaint(x,y,z,i=i):
        return limbpaint(x,y-.25,z)
    shin=loft('Lower leg • reference patch '+str(i),lower,[(-.27,.065,.065,.012),(-.19,.075,.075,0),(-.05,.086,.087,0),(.035,.075,.075,0)],'y',lowpaint,26,28)
    fur(shin,480,.012,paint=lowpaint)
    paw=part('paw'+str(i),(0,-.25,.085),lower)
    def pawpaint(x,y,z):
        white=softmask(z-.025,.018)
        return mixcoat(limbpaint(x,y-.50,z),CREAM,white)
    foot=ellipsoid('Paw • white toes',paw,(0,.001,0),(.109,.068,.145),pawpaint,40,24)
    fur(foot,450,.010,flow=(0,-.3,1),paint=pawpaint)
    for x in [-.037,.037]:tube('Toe crease',paw,[(x,.052,.098),(x,.045,.13),(x,.021,.142)],.0012,material('Toe seam '+str(i)+str(x),rgb('b8aea1'),.95),sides=4,steps=7)
    ellipsoid('Paw • central pad',paw,(0,-.062,-.008),(.043,.005,.047),None,20,12,darkMat)

tail=part('tail',(0,.82,-.76))
tailob=loft('Tail • short hooked dark ringed tip',tail,[(-.02,.065,.065,0),(.08,.077,.077,0),(.25,.071,.071,-.014),(.40,.065,.065,.004),(.50,.062,.057,.065),(.55,.042,.041,.11),(.565,.003,.003,.12)],'y',tailpaint,48,24)
fur(tailob,1600,.018,flow=(0,1,0),paint=tailpaint)
part('anger',(0,0,0),head)
atlas.pixels.foreach_set(atlas_pixels.ravel())
atlas.filepath_raw=str(ROOT/'assets/dingding/coat.png');atlas.file_format='PNG';atlas.save();atlas.pack()
normal=bpy.data.images.new('Dingding | fine fur normal',width=2048,height=2048,alpha=True)
normal.colorspace_settings.name='Non-Color';normal.pixels.foreach_set(normal_pixels.ravel())
normal.filepath_raw=str(ROOT/'assets/dingding/fur-normal.png');normal.file_format='PNG';normal.save();normal.pack()
normaltex=coat.node_tree.nodes.new('ShaderNodeTexImage');normaltex.image=normal
normalnode=coat.node_tree.nodes.new('ShaderNodeNormalMap');normalnode.inputs['Strength'].default_value=.18
coat.node_tree.links.new(normaltex.outputs['Color'],normalnode.inputs['Color'])
coat.node_tree.links.new(normalnode.outputs['Normal'],coat.node_tree.nodes['Principled BSDF'].inputs['Normal'])

# Consolidate by animated part and material, reducing small-object draw calls.
for parent in list(parts.values()):
    meshes=[o for o in parent.children if o.type=='MESH']
    buckets={}
    for o in meshes:buckets.setdefault(o.data.materials[0].name,[]).append(o)
    for group in buckets.values():
        if len(group)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in group:o.select_set(True)
        bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()

# Join the coat volumes and author the native armature/weights before export.
import runpy
rig_tools=runpy.run_path(str(ROOT/'scripts/rig-cat.py'))
armature,continuous_skin=rig_tools['rig_character'](scene,root,tail_surface_weighting=True)

# Asset-only export: closed eyes are included but runtime controls visibility.
bpy.ops.object.select_all(action='DESELECT')
for o in scene.objects:
    o.hide_viewport=False;o.hide_render=False;o.hide_set(False);o.select_set(True)
glb=ROOT/'public/models/dingding.glb';glb.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=False,export_extras=True,export_image_format='JPEG',export_jpeg_quality=85,export_skins=True,export_animations=False)

# Studio rig is kept in the editable .blend, outside the game asset.
floorMat=material('Studio | warm stone',rgb('9c938a'),.94)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.005));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(floorMat)
def aim(ob,p):ob.rotation_euler=(v(p)-ob.location).to_track_quat('-Z','Y').to_euler()
def light(name,p,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=v(p);aim(ob,(0,.75,0))
light('Key | large softbox',(-3,4,4),450,4,(1,.87,.76))
light('Fill | cool sky',(3,2.5,1),220,3,(.75,.86,1))
light('Rim | fur separation',(1,3,-3),550,3,(1,.93,.84))
data=bpy.data.cameras.new('Dingding portrait');camera=bpy.data.objects.new('Dingding portrait',data);scene.collection.objects.link(camera)
camera.location=v((2.9,1.85,4.3));aim(camera,(0,.82,.05));data.type='ORTHO';data.ortho_scale=2.6;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'artifacts/dingding-blender/dingding-three-quarter.png')
for name in ['closedEye0','closedEye1']:
    parts[name].hide_render=True
    parts[name].hide_set(True)
    for o in parts[name].children:
        o.hide_render=True;o.hide_set(True)
for ob in root.children_recursive:
    if str(ob.get('visibilitySlot','')).startswith('closedEye'):
        ob.hide_render=True;ob.hide_set(True)
# Keep the authored skeleton in its neutral bind pose when saving the source.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=3.5
        area.spaces.active.region_3d.view_location=v((0,.8,0))
        area.spaces.active.shading.type='MATERIAL'
for filename in ['reference-front.png', 'reference-side.png', 'reference-tail.png', 'reference-walking.png']:
    ref=bpy.data.images.load(str(ROOT/'assets/dingding'/filename));ref.pack();ref.use_fake_user=True
source=ROOT/'assets/dingding/dingding.blend';source.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
report={'blend':str(source),'glb':str(glb),'vertices':sum(len(o.data.vertices) for o in root.children_recursive if o.type=='MESH'),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in root.children_recursive if o.type=='MESH'),'objects':len(root.children_recursive),'glb_bytes':glb.stat().st_size}
(ROOT/'artifacts/dingding-blender/asset-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))

# Preview is generated by Blender; geometry and textures stay editable in source.
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX';prefs.refresh_devices()
    for device in prefs.devices:device.use=device.type=='OPTIX'
    scene.cycles.device='GPU' if any(d.type=='OPTIX' for d in prefs.devices) else 'CPU'
except Exception:
    scene.cycles.device='CPU'
bpy.ops.render.render(write_still=True)
