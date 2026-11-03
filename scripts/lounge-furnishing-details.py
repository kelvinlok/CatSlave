"""Reference-specific window tree and soft blanket. Executed by build-lounge.py.

Uses the author's mesh helpers and existing scene, after right-wing placement.
The entrance tree is deliberately untouched.
"""
import numpy as np

def detail_tube(name, points, radii, material, sides=12, irregular=0):
    points=[Vector(p) for p in points];verts=[];faces=[]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        axis=Vector((0,1,0)) if abs(tangent.y)<.9 else Vector((1,0,0))
        a=tangent.cross(axis).normalized();b=tangent.cross(a).normalized()
        for j in range(sides):
            theta=j*2*pi/sides;r=radii[i]*(1+irregular*sin(j*2.7+i*.41))
            verts.append(tuple(p+r*(a*cos(theta)+b*sin(theta))))
        if i:
            for j in range(sides):faces.append(((i-1)*sides+j,(i-1)*sides+(j+1)%sides,i*sides+(j+1)%sides,i*sides+j))
    faces.extend([tuple(range(sides-1,-1,-1)),tuple((len(points)-1)*sides+j for j in range(sides))])
    ob=mesh(name,verts,faces,material)
    for f in ob.data.polygons:f.use_smooth=True
    uv=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            vi=ob.data.loops[li].vertex_index;uv.data[li].uv=((vi%sides)/sides,(vi//sides)/(len(points)-1))
    return ob

def detail_ring(name,center,radius,height,material,thickness=.025):
    x,y,z=center
    points=[(x+radius*cos(i*pi/24),y+height*sin(i*pi/12),z+radius*sin(i*pi/24)) for i in range(49)]
    return detail_tube(name,points,[thickness]*len(points),material,8)

def add_soft_blanket():
    global group
    group=scene.objects['09 | cream loveseat by sunroom opening']
    for ob in list(group.children):
        if ob.name.startswith(('Woven throw','Woven diamond','Blanket ')):
            bpy.data.objects.remove(ob,do_unlink=True)
    fabric=mat('Blanket | woven ivory rust and blue yarn','e6dcc7',.98)
    fabric.node_tree.nodes['Principled BSDF'].inputs['Sheen Weight'].default_value=.25
    texture=bpy.data.images.load(str(OUT/'blanket-woven.png'),check_existing=True);texture.pack()
    tex=fabric.node_tree.nodes.new('ShaderNodeTexImage');tex.image=texture
    fabric.node_tree.links.new(tex.outputs['Color'],fabric.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    yarn=mat('Blanket | loose ivory fringe','cfc3a7',1)
    # Catmull-Rom cross-section: over the back crest, down the back cushion,
    # into the seat crease, across the seat, then freely hanging over its front.
    profile=[(1.53,4.13),(1.75,4.08),(1.81,3.97),(1.73,3.79),
             (1.30,3.775),(.88,3.76),(.70,3.64),(.705,3.33),(.70,3.01),
             (.67,2.79),(.54,2.69),(.32,2.70),(.14,2.72)]
    def cloth_point(u,t):
        f=t*(len(profile)-1);i=min(len(profile)-2,int(f));a=f-i
        p0=Vector(profile[max(0,i-1)]);p1=Vector(profile[i]);p2=Vector(profile[i+1]);p3=Vector(profile[min(len(profile)-1,i+2)])
        yz=.5*((2*p1)+(-p0+p2)*a+(2*p0-5*p1+4*p2-p3)*a*a+(-p0+3*p1-3*p2+p3)*a*a*a)
        x=-1.8+(u-.5)*2.43
        # Irregular folds are continuous through the drape, never raised tiles.
        wave=sin(u*14*pi+t*1.3)*.023+sin(u*6*pi-.8+t*2)*.019
        side=(abs(u-.5)*2)**8
        y=yz.x+wave*(.5 if .5<t<.8 else .7)+.014*sin(t*29+u*7)+side*.025*sin(t*22)
        z=yz.y+wave*(1 if t<.54 or t>.83 else .25)
        x+=side*.028*sin(t*17+u*2)
        if t>.9:y+=((t-.9)/.1)*(.035*sin(u*8*pi)+.015*sin(u*21*pi))
        return (x,y,z)
    nu,nv=64,112;verts=[cloth_point(i/nu,j/nv) for j in range(nv+1) for i in range(nu+1)]
    faces=[(j*(nu+1)+i,j*(nu+1)+i+1,(j+1)*(nu+1)+i+1,(j+1)*(nu+1)+i) for j in range(nv) for i in range(nu)]
    ob=mesh('Blanket continuous draped textile',verts,faces,fabric)
    for f in ob.data.polygons:f.use_smooth=True
    uv=ob.data.uv_layers.new(name='UVMap')
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            vi=ob.data.loops[li].vertex_index;uv.data[li].uv=((vi%(nu+1))/nu,1-(vi//(nu+1))/nv)
    solid=ob.modifiers.new('Soft woven thickness','SOLIDIFY');solid.thickness=.006;solid.offset=0
    for u in [0,1]:
        pts=[cloth_point(u,j/112) for j in range(113)]
        detail_tube('Blanket softly rolled side hem',pts,[.009]*len(pts),yarn,6)
    # Individual dangling thread bundles, gravity-curved, along the front and sides.
    for i in range(82):
        u=(i+.5)/82;x,y,z=cloth_point(u,1);length=.075+.035*(.5+.5*sin(i*2.6))
        detail_tube('Blanket front tassel',[(x,y,z),(x+.008*sin(i),y-length*.5,z+.015),(x+.015*sin(i*1.4),y-length,z+.01)],[.006,.004,.0015],yarn,5)
    for u in [0,1]:
        for i in range(45):
            t=.08+i*.02;x,y,z=cloth_point(u,t);sgn=-1 if u==0 else 1
            detail_tube('Blanket side fringe',[(x,y,z),(x+sgn*.045,y-.025,z),(x+sgn*.06,y-.065,z+.007)],[.0045,.003,.001],yarn,5)

def add_branching_tree():
    global group
    existing=scene.objects.get('15 | distinct branching window tree')
    if existing:
        for ob in list(existing.children):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.objects.remove(existing,do_unlink=True)
    old=scene.objects['12 | natural cat trees and entry curtain']
    for ob in list(old.children):
        if ob.location.x>3 and -ob.location.y>5:bpy.data.objects.remove(ob,do_unlink=True)
    group=section('15 | distinct branching window tree')
    tree=group
    bark=mat('Window tree | natural brown bark','94633d',.94)
    endgrain=mat('Window tree | cut branch ends','b58b58',.85)
    roofmat=mat('Window tree | warm timber roof','b78a53',.75)
    dark=mat('Window tree | shaded house interior','584530',.9)
    sisal=mat('Window tree | tightly wrapped sisal','c4a378',.95)
    # Exportable bark texture adds longitudinal fibers without a runtime shader.
    h,w=512,128;yy,xx=np.mgrid[:h,:w];rng=np.random.default_rng(944)
    noise=1+.12*np.sin(xx*.63+np.sin(yy*.018)*2)+.045*np.sin(xx*1.8+yy*.004)+rng.normal(0,.018,(h,w))
    rgb=np.array([148,99,61])/255;pixels=np.ones((h,w,4),dtype=np.float32);pixels[:,:,:3]=np.clip(rgb*noise[:,:,None],0,1)
    im=bpy.data.images.new('Window tree | bark fibers',width=w,height=h,alpha=False);im.pixels.foreach_set(pixels.ravel());im.pack()
    n=bark.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;bark.node_tree.links.new(n.outputs['Color'],bark.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    cube('Window tree broad natural wood base',(0,.055,0),(.95,.11,1.0),wood,.08)
    # Forked organic structure, with each branch following a separate path.
    paths=[([(0,.1,0),(-.09,.65,.01),(.07,1.32,-.04),(.03,1.95,0),(.22,2.6,-.04),(.30,3.42,-.05)],[.18,.17,.16,.15,.13,.105]),
           ([(.03,1.7,0),(-.30,2.15,.02),(-.75,2.64,-.02),(-1.05,3.18,-.05)],[.14,.12,.09,.06]),
           ([(-.25,2.13,.02),(-.72,2.36,.11),(-1.25,2.6,.18)],[.11,.08,.025]),
           ([(.12,2.19,0),(.48,2.37,-.02),(.79,2.72,.02)],[.11,.075,.024]),
           ([(0,1.2,0),(-.30,1.45,.33),(-.55,1.68,.5)],[.10,.075,.045]),
           ([(0,.48,0),(.22,.65,-.04),(.28,.77,-.10)],[.10,.07,.04])]
    for i,(points,radii) in enumerate(paths):detail_tube('Natural forked trunk '+str(i),points,radii,bark,14,.1)
    # Rope winds around the lower trunk and the upright support beneath the house.
    for center,height,radius,count in [((-.02,.28,0),.58,.177,32),((.26,2.85,-.045),.53,.12,28)]:
        x,y,z=center;pts=[(x+radius*cos(i*pi/6),y+height*i/(count*12),z+radius*sin(i*pi/6)) for i in range(count*12+1)]
        detail_tube('Spiral sisal wrapping',pts,[.009]*len(pts),sisal,5)
    def basket(name,x,y,z,rx,rz):
        rod(name+' wooden support',(x,y-.07,z),(x,y,z),min(rx,rz),wood)
        ellipsoid(name+' fabric cushion',(x,y+.035,z),(rx*.94,.055,rz*.94),cream)
        for level in [0,.12]:
            pts=[(x+rx*cos(i*pi/24),y+level,z+rz*sin(i*pi/24)) for i in range(49)]
            detail_tube(name+' woven rim',pts,[.025]*49,wood,8)
        for i in range(16):
            a=i*pi/8;rod(name+' low wicker rail',(x+rx*cos(a),y,z+rz*sin(a)),(x+rx*cos(a),y+.12,z+rz*sin(a)),.016,wood)
    basket('High branch oval hammock',-1.05,3.2,-.05,.52,.32)
    basket('Lower offset nest',.28,.80,-.10,.32,.28)
    # Real bowl-shaped transparent shell, open at the top and supported by a timber ring.
    bowl=mat('Window tree | clear acrylic bowl','d1e5e8',.13)
    bs=bowl.node_tree.nodes['Principled BSDF'];bs.inputs['Alpha'].default_value=.23;bs.inputs['Coat Weight'].default_value=.5
    bowl.diffuse_color=(*color('d1e5e8'),.23);bowl.surface_render_method='DITHERED'
    verts=[];faces=[];cx,cy,cz=-.55,1.7,.5
    for j in range(13):
        a=.03+(pi/2-.03)*j/12;r=.43*sin(a);y=cy-.34*cos(a)
        for i in range(40):verts.append((cx+r*cos(i*pi/20),y,cz+r*sin(i*pi/20)))
        if j:
            for i in range(40):faces.append(((j-1)*40+i,(j-1)*40+(i+1)%40,j*40+(i+1)%40,j*40+i))
    ob=mesh('Clear hemisphere bowl perch',verts,faces,bowl)
    for f in ob.data.polygons:f.use_smooth=True
    sol=ob.modifiers.new('Acrylic shell thickness','SOLIDIFY');sol.thickness=.012
    detail_ring('Bowl solid oak mounting ring',(cx,cy,cz),.455,0,wood,.035)
    # House shell with actual openings; no dark circles pasted onto solid faces.
    cube('House floor',(.32,3.40,-.05),(1.08,.07,.90),wood,.015)
    cube('House rear wall',(.32,3.92,-.48),(1.08,1.0,.055),wood,.012)
    left=cube('House left wall',(-.20,3.92,-.05),(.055,1.0,.90),wood,.01)
    right=cube('House right wall',(.84,3.92,-.05),(.055,1.0,.90),wood,.01)
    front=cube('House front round doorway',(.32,3.92,.38),(1.08,1.0,.055),wood,.01)
    for wallob,a,b,radius in [(front,(.32,3.92,.20),(.32,3.92,.60),.30),
                              (left,(-.4,3.91,-.04),(0,3.91,-.04),.25)]:
        cut=detail_tube('Temporary house opening cutter',[a,b],[radius,radius],None,48)
        mod=wallob.modifiers.new('True circular entrance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
        bpy.context.view_layer.objects.active=wallob;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
    cube('House interior cushion',(.32,3.47,-.05),(.95,.07,.76),cream,.025)
    for z in [-.49,.40]:mesh('House triangular gable',[(-.22,4.42,z),(.86,4.42,z),(.32,4.84,z)],[(0,1,2)],wood)
    for side in [-1,1]:
        x=.32+side*.66
        ob=panel('House sloping roof',[ (.32,4.88,-.60),(x,4.41,-.60),(x,4.41,.52),(.32,4.88,.52)],roofmat)
        so=ob.modifiers.new('Roof plank thickness','SOLIDIFY');so.thickness=.045
        detail_tube('Roof gable edge',[(x,4.41,.54),(.32,4.88,.54)],[.026,.026],wood,8)
    # Narrow rung ladder hangs from the left of the house to the fork below.
    for x in [-.34,-.67]:detail_tube('Hanging ladder rope',[(x,3.4,.12),(x-.04,2.9,.17),(x-.06,2.25,.27)],[.014,.014,.014],sisal,7)
    for i in range(7):
        y=2.3+i*.165;rod('Ladder wooden rung',(-.73,y,.25-(y-2.3)*.1),(-.35,y,.25-(y-2.3)*.1),.027,wood)
    # Leafy clusters branch away from, rather than wrapping into, the house opening.
    clusters=[(-1.05,2.57,.15),(-.72,2.74,-.05),(.72,2.7,.01),(.43,2.15,-.1),(-.18,1.75,-.14)]
    rng=random.Random(185)
    for k,(x,y,z) in enumerate(clusters):
        rod('Foliage twig',(x-.15,y-.1,z),(x+.15,y+.25,z),.014,bark)
        for i in range(16):
            px=x+rng.uniform(-.32,.32);py=y+rng.uniform(-.28,.36);pz=z+rng.uniform(-.14,.14)
            length=rng.uniform(.17,.30);width=length*.35;angle=rng.uniform(-pi,pi)
            dx=sin(angle)*length;dy=cos(angle)*length
            vs=[(px,py,pz),(px+dx*.3-width,py+dy*.3,pz+.025),(px+dx*.72-width*.6,py+dy*.72,pz+.03),
                (px+dx,py+dy,pz),(px+dx*.72+width*.6,py+dy*.72,pz+.03),(px+dx*.3+width,py+dy*.3,pz+.025),(px+dx*.5,py+dy*.5,pz+.07)]
            leafob=mesh('Window tree curved leaf',vs,[(j,(j+1)%6,6) for j in range(6)],leafm[(i+k)%4])
            for f in leafob.data.polygons:f.use_smooth=True
    tree.location=v((4.05,0,6.3));tree.rotation_euler.z=-pi/2
    tree['reference']='window tree with forked natural branches, pitched house, ladder, clear bowl; different from entrance tree'

add_soft_blanket()
add_branching_tree()
bpy.context.view_layer.update()
