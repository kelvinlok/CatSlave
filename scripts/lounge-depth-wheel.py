"""Wider entry span, projecting sunroom wall and open white exercise wheel.

Run after the other lounge refinements. The omitted side recess is sealed off.
The wheel's drum stays a separate exported transform for runtime rotation.
"""
layout = json.loads((OUT/'layout.json').read_text(encoding='utf-8'))
extra = -5 - layout['mainRoom']['minX']

def center_game(ob):
    if ob.type == 'MESH' and len(ob.data.vertices):
        p = sum((ob.matrix_world @ vertex.co for vertex in ob.data.vertices), Vector()) / len(ob.data.vertices)
    else:
        p = ob.matrix_world.translation
    return Vector((p.x, p.z, -p.y))

def shift(ob, x=0, z=0):
    ob.location.x += x; ob.location.y -= z

bpy.context.view_layer.update()
architecture = scene.objects['02 | architectural shell']
for ob in list(architecture.children):
    if ob.name.startswith(('Side plaster wall','Skirting')) and ob.location.x < 0:
        shift(ob, -extra)
    elif ob.name == 'Mural end wall':
        ob.location.x = -extra/2; ob.scale.x = (10.2+extra)/10.2
    elif ob.name == 'End skirting':
        ob.location.x = -extra/2; ob.scale.x = (10+extra)/10
    elif ob.name.startswith(('Entry wall |','Entry skirting |')):
        bpy.data.objects.remove(ob, do_unlink=True)
    elif ob.name == 'Entry door lintel':
        shift(ob, -extra)

group = architecture
for label, lo, hi in [('cabinet side', -5.1-extra, -2.7-extra), ('sofa side', -.9-extra, 5.1)]:
    cube('Entry wall | '+label, ((lo+hi)/2, 2.7, 8.08), (hi-lo, 5.4, .16), wall, .008)
    cube('Entry skirting | '+label, ((lo+hi)/2, .12, 7.96), (hi-lo, .24, .05), trim, .008)
for name in ['14 | entry reception cabinet','15 | clear glass entry door','16 | raised Namaoste wall logo']:
    shift(scene.objects[name], -extra)

# Left-wall fixtures follow the moved wall; furniture is translated, not stretched.
for ob in list(scene.objects['04 | walnut cubbies and black grid screen'].children):
    if ob.name.startswith('Folding screen'):
        bpy.data.objects.remove(ob, do_unlink=True)
    else:
        shift(ob, -extra)
shift(scene.objects['12 | natural cat trees and entry curtain'], -extra)
chairs = scene.objects['07 | lounge floor chairs and occasional tables']
for ob in list(chairs.children):
    p = center_game(ob)
    move = ob.name.startswith(('Gray floor chair','Table by mural','Table by gray seats'))
    move |= ob.name.startswith('Splayed oak table leg') and p.x < -.9 and p.z < -2.8
    move |= ob.name.startswith('Soft furniture contact') and any(
        math.hypot(p.x-x, p.z-z) < .1 for x,z in [(-2.94,-4.75),(-2.94,-2.3),(-2.05,-6),(-1.85,-3.45)])
    if move: shift(ob, -extra)
for ob in scene.objects['08 | flower beds and rounded cat hideaway'].children:
    p = center_game(ob)
    if p.x < -2.5: shift(ob, -extra)
    elif p.x > 3 and p.z < -5.5: shift(ob, -1.2, 1.2)
for ob in list(scene.objects['13 | fixed service furnishings'].children):
    if ob.name.startswith('Air purifier'):
        bpy.data.objects.remove(ob, do_unlink=True)
    elif ob.name.startswith(('Wall service shelf','Service shelf frame')):
        bpy.data.objects.remove(ob, do_unlink=True)

group = scene.objects['01 | oak plank floor']
cube('Entry extension subfloor', (-5-extra/2,-.12,0), (extra,.2,16.2), wood, 0)
for ix in range(math.ceil(extra/.5)):
    lo_x = -5-extra+ix*.5; hi_x = min(-5,lo_x+.5)
    for iz in range(10):
        end = -8+iz*2+(ix%3)*.63; lo=max(-8,end-2); hi=min(8,end)
        if hi>lo:
            cube('Extension staggered oak board', ((lo_x+hi_x)/2,-.015,(lo+hi)/2),
                 (hi_x-lo_x-.006,.03,hi-lo-.006), floorM[(ix+iz)%6], .003)

group = scene.objects['03 | ceiling and track lights']
for ob in list(group.children):
    p=center_game(ob)
    if ob.name.startswith('Perimeter warm cove light'):
        if p.x < -4: shift(ob,-extra)
        elif abs(p.z)>7:
            shift(ob,-extra/2); ob.scale.x=(9.65+extra)/9.65
    elif ob.name.startswith('Black lighting track'):
        shift(ob,-extra/2); ob.scale.x=(8.7+extra)/8.7
for ix in range(2):
    for iz in range(8):
        cube('Extension ceiling tile', (-5-extra+(ix+.5)*extra/2,5.43,-7+iz*2),
             (extra/2-.02,.1,1.98), trim, .005)
for z in [-5.7,-.5,5.8]:
    rod('Extension spotlight hanger',(-5.8,5.25,z),(-5.8,4.98,z),.025,black)
    rod('Extension track spotlight',(-5.8,4.98,z),(-5.8,4.57,z-.18),.105,black)
    ellipsoid('Extension spotlight lens',(-5.8,4.57,z-.18),(.08,.015,.08),glow)

section('20 | projecting wall to sunroom')
wall_x = layout['blockedFloor']['minX']; return_end = 5.1
cube('Sunroom approach | full height plaster wall', (wall_x+.1,2.7,-4.55), (.2,5.4,6.9), wall, .012)
cube('Sunroom approach | solid end return', ((wall_x+return_end)/2,2.7,-1.2), (return_end-wall_x,5.4,.2), wall, .012)
cube('Sunroom approach | face skirting', (wall_x-.03,.12,-4.55), (.055,.24,6.9), trim, .008)
cube('Sunroom approach | return skirting', ((wall_x+return_end)/2,.12,-1.07), (return_end-wall_x,.24,.055), trim, .008)
cube('Sunroom approach | cove light', (wall_x-.035,5.24,-4.55), (.04,.04,6.82), glow, .004)
group['construction'] = 'Solid projecting wall; side recess marked X intentionally omitted'

# Open drum on low roller cradle; no central hub or spokes obstruct the cat.
w = layout['furniture']['wheel']; wx,wz,cy = w['x'],w['z'],w['centerY']
wheelwhite = mat('Wheel | satin white shell', 'f5f4ef', .4)
tread = mat('Wheel | pale non-slip running liner', 'cfd1ca', .95)
treadseam = mat('Wheel | liner joints', 'aeb5ab', .9)
rubber = mat('Wheel | charcoal roller rubber', '454a46', .88)
hardware = mat('Wheel | recessed axle caps', 'b2b9b5', .32, .7)
base = section('21 | white cat exercise wheel'); base['catWheel'] = True
contact(wx,wz,1.45,.63)
cube('Wheel | low rounded plinth', (wx,.095,wz+.015), (2.86,.16,1.07), wheelwhite, .07)
for x in [-1.11,1.11]:
    for z in [-.36,.36]:
        cube('Wheel | non-slip foot', (wx+x,.035,wz+z), (.24,.05,.22), rubber, .025)
for x in [-.73,.73]:
    for z in [-.37,.37]:
        rod('Wheel | white roller cradle', (wx+x*1.38,.15,wz+z), (wx+x,.32,wz+z), .075, wheelwhite)
    rod('Wheel | lower support roller', (wx+x,.32,wz-.46), (wx+x,.32,wz+.46), .09, rubber)
    for z in [-.48,.48]:
        rod('Wheel | roller axle cap', (wx+x,.32,wz+z-.015), (wx+x,.32,wz+z+.015), .045, hardware)

drum = bpy.data.objects.new('CatWheelRotor',None); scene.collection.objects.link(drum)
drum.parent=root; drum.location=v((wx,cy,wz)); drum['catWheelRotor']=True; drum['catWheel']=True
group=drum
def annulus(name, inner, outer, zlo, zhi, material):
    n=96; vertices=[]; faces=[]
    for z,r in [(zlo,inner),(zlo,outer),(zhi,outer),(zhi,inner)]:
        for i in range(n):
            a=2*pi*i/n; vertices.append((r*cos(a),r*sin(a),z))
    for j in range(4):
        k=(j+1)%4
        for i in range(n):
            nxt=(i+1)%n; faces.append((j*n+i,j*n+nxt,k*n+nxt,k*n+i))
    ob=mesh(name,vertices,faces,material)
    for polygon in ob.data.polygons: polygon.use_smooth=True
    bevel=ob.modifiers.new('Soft wheel edges','BEVEL'); bevel.width=.009; bevel.segments=2
    ob.modifiers.new('Wheel face normals','WEIGHTED_NORMAL')
    return ob
annulus('Wheel | hollow white drum',1.202,w['outerRadius'],-.45,.45,wheelwhite)
annulus('Wheel | continuous cushioned running surface',w['innerRadius'],1.204,-.425,.425,tread)
for z in [-.46,.46]:
    annulus('Wheel | rounded white rim',1.165,1.32,z-.035,z+.035,wheelwhite)
# Restrained transverse joins make rotation readable without a distracting pattern.
for i in range(48):
    a=2*pi*i/48; da=.003
    mesh('Wheel | subtle tread seam',[(1.179*cos(a+t),1.179*sin(a+t),z)
         for t,z in [(-da,-.405),(da,-.405),(da,.405),(-da,.405)]],[(0,3,2,1)],treadseam)
for i in range(12):
    a=2*pi*i/12
    for z in [-.499,.499]:
        rod('Wheel | flush rim fastener',(1.25*cos(a),1.25*sin(a),z-.002),
            (1.25*cos(a),1.25*sin(a),z+.002),.012,hardware)
scene['depthWheelRevision']='Entry span +2.8m; projecting sunroom wall; interactive white wheel; X recess omitted'
bpy.context.view_layer.update()
