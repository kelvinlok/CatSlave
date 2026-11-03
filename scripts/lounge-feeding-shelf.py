"""Front-facing feeding shelf from room-reference/time-52.jpg.

Runs after the room-depth helper. Shared metadata places the free-play bowls;
the exported shelf leaves their floor and the cats' feeding approach open.
"""
from mathutils import Matrix
print('LOUNGE_STAGE feeding shelf and photographs', flush=True)

# Make space beside the widened return without squeezing the furnishings.
exec((ROOT/'scripts/lounge-center-mural.py').read_text(encoding='utf-8'))
for ob in scene.objects['07 | lounge floor chairs and occasional tables'].children:
    p = center_game(ob)
    if ob.name.startswith('Mural floor chair') or (
        ob.name.startswith('Soft furniture contact') and
        any(math.hypot(p.x-x,p.z+7.05)<.1 for x in [-1.3,.25])):
        shift(ob,-2.1)
for ob in scene.objects['08 | flower beds and rounded cat hideaway'].children:
    p = center_game(ob)
    if ob.name.startswith(('Pod |','Pod angled timber leg')) or (p.x>1 and p.z<-4):
        shift(ob,-2.1)
bpy.context.view_layer.update()
print('LOUNGE_STAGE rear furniture shifted', flush=True)

s = layout['feedingShelf']; sx=s['centerX']; front=s['frontZ']; back=s['backZ']
width=s['maxX']-s['minX']; depth=front-back; top=s['topHeight']
section('22 | sunroom feeding shelf')
group['source']='feeding-shelf-reference.jpg (time-52.jpg)'
group['construction']='Front of the broad sunroom return; floor-level bowls supplied by free play'
shell=mat('Shelf | warm white tubular frame','e9e7de',.52,.15)
paper=mat('Shelf | white photo cards','fffaf0',.85)
feet=mat('Shelf | soft foot caps','77786d',.92)
brass=mat('Speaker | warm brass trim and controls','b39a60',.35,.68)
speaker_black=mat('Speaker | black textured cabinet','252524',.94)

for y in [.92,top]:
    cube('Feeding shelf | oak board',(sx,y-.025,(front+back)/2),(width,.05,depth),wood,.012)
    cube('Feeding shelf | shallow oak back lip',(sx,y+.045,back+.025),(width-.03,.13,.035),wood,.008)
# Tubular rounded side frames, like the reference rather than solid cabinet sides.
for x in [s['minX']+.01,s['maxX']-.01]:
    for z in [back+.05,front-.05]:
        rod('Feeding shelf | upright',(x,.025,z),(x,top+.12,z),.025,shell)
        rod('Feeding shelf | foot cap',(x,.008,z),(x,.035,z),.027,feet)
    radius=.10; z0=back+.05; z1=front-.05; y0=top+.12
    for zc,sign in [(z0+radius,-1),(z1-radius,1)]:
        points=[(x,y0+radius*sin(i*pi/16),zc+sign*radius*cos(i*pi/16)) for i in range(9)]
        for a,b in zip(points,points[1:]): rod('Feeding shelf | curved top corner',a,b,.025,shell)
    rod('Feeding shelf | top side rail',(x,y0+radius,z0+radius),(x,y0+radius,z1-radius),.025,shell)
    rod('Feeding shelf | lower side rail',(x,.07,z0),(x,.07,z1),.022,shell)
cube('Feeding shelf | white lower backing',(sx,.45,back+.025),(width-.06,.79,.018),shell,.006)
rod('Feeding shelf | low rear rail',(s['minX'],.07,back+.035),(s['maxX'],.07,back+.035),.02,shell)

# Actual reference photographs, embedded at a modest texture size.
photos=[('Choco','choco/reference.png'),('Latte','latte/reference-face-legs.png'),
        ('Di Di','didi/reference.png'),('Siu Choi','xiaosai/reference-face.png'),
        ('Yelo','yelo/reference-portrait.png'),('Miller','miller/reference-portrait.png'),
        ('Momo','momo/reference-portrait.png'),('Zhen Zhen Zi','zhenzhenzi/reference-seated.png'),
        ('Ding Ding','dingding/reference-front.png')]
for index,(name,path) in enumerate(photos):
    x=sx+(index-4)*.342; y=s['photoHeight']; z=front+.019
    cube('Cat photo | white print '+name,(x,y,z),(.319,.347,.012),paper,.004)
    img=bpy.data.images.load(str(ROOT/'assets'/path),check_existing=False)
    ratio=img.size[0]/img.size[1]; scale=256/max(img.size)
    img.scale(max(1,round(img.size[0]*scale)),max(1,round(img.size[1]*scale)))
    img.name='Shelf photo | '+name; img.pack()
    material=mat('Cat photo | '+name,'ffffff',.9)
    tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
    material.node_tree.links.new(tex.outputs['Color'],material.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    pw=min(.285,.28*ratio); ph=pw/ratio
    photo=panel('Cat photo | '+name,[(x-pw/2,y-ph/2+.012,z+.007),(x+pw/2,y-ph/2+.012,z+.007),
                                  (x+pw/2,y+ph/2+.012,z+.007),(x-pw/2,y+ph/2+.012,z+.007)],material)
    uv=photo.data.uv_layers.new(name='Photo UV')
    for loop,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=co
    for xx in [x-.105,x+.105]:
        cube('Cat photo | small mounting clip',(xx,y+.166,z+.011),(.022,.036,.014),shell,.004)

# Marshall Bluetooth speaker: black cabinet, woven grille, brass piping,
# cursive badge and recessed top control panel with five tactile knobs.
px=s['minX']+.52; pz=(front+back)/2; py=top+.27
cube('Marshall speaker | cabinet',(px,py,pz),(.78,.49,.35),speaker_black,.037)
cube('Marshall speaker | brass grille border',(px,py,pz+.178),(.725,.425,.015),brass,.026)
grille=mat('Speaker | woven warm gray grille','888679',.96)
import numpy as np
n=128; yy,xx=np.mgrid[0:n,0:n]
value=.51+.13*((xx%4)<2)+.10*((yy%4)<2)+np.random.default_rng(4).uniform(-.035,.035,(n,n))
pixels=np.ones((n,n,4),dtype=np.float32)
pixels[:,:,:3]=value[:,:,None]*np.array([1,.97,.88])
img=bpy.data.images.new('Marshall woven grille',width=n,height=n,alpha=False)
img.pixels.foreach_set(pixels.reshape(-1));img.pack()
tex=grille.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img
grille.node_tree.links.new(tex.outputs['Color'],grille.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
gp=panel('Marshall speaker | fabric grille',[(px-.349,py-.201,pz+.187),(px+.349,py-.201,pz+.187),
                                          (px+.349,py+.201,pz+.187),(px-.349,py+.201,pz+.187)],grille)
uv=gp.data.uv_layers.new(name='Grille weave')
for loop,co in zip(uv.data,[(0,0),(2,0),(2,1),(0,1)]):loop.uv=co
font=bpy.data.fonts.load('C:/Windows/Fonts/BRUSHSCI.TTF')
data=bpy.data.curves.new('Marshall script badge','FONT');data.body='Marshall';data.font=font
data.align_x='CENTER';data.align_y='CENTER';data.size=.18;data.extrude=.0015;data.bevel_depth=.0004
data.resolution_u=3;data.bevel_resolution=0
badge=bpy.data.objects.new('Marshall speaker | raised script badge',data);scene.collection.objects.link(badge);finish(badge,badge.name,brass)
badge.matrix_world=Matrix(((1,0,0,px),(0,0,-1,-pz-.193),(0,1,0,py),(0,0,0,1)))
bpy.ops.object.select_all(action='DESELECT');badge.select_set(True);bpy.context.view_layer.objects.active=badge
bpy.ops.object.convert(target='MESH')
cube('Marshall speaker | top control recess',(px,py+.244,pz-.012),(.54,.006,.155),black,.018)
cube('Marshall speaker | brass control plate',(px,py+.248,pz-.012),(.51,.008,.128),brass,.014)
for i in range(5):
    x=px-.205+i*.10
    rod('Marshall speaker | control knob',(x,py+.25,pz-.01),(x,py+.279,pz-.01),.022,speaker_black)
    cube('Marshall speaker | knob marker',(x,py+.28,pz-.002),(.004,.002,.018),paper,.001)
for x in [px-.28,px+.28]:
    for z in [pz-.11,pz+.11]:cube('Marshall speaker | rubber foot',(x,top+.017,z),(.07,.032,.06),feet,.012)

# Keep a shelf camera for repeatable source-file inspection.
scene['feedingShelfRevision']='Widened sunroom front face; reference shelf, Marshall speaker, nine cat photographs; free-play bowls beneath'
bpy.context.view_layer.update()
print('LOUNGE_STAGE feeding shelf complete', flush=True)
