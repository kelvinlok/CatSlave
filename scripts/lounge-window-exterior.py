"""Clear exterior glazing and a city with real depth beyond the sunroom.

The game animates Exterior-prefixed materials and a live sky from device time.
All parts remain editable in Blender; city windows share two materials.
"""
for ob in list(scene.objects):
    if ob.name.startswith(('Blue sky beyond glazing','Distant urban building','Distant window stripe')):
        bpy.data.objects.remove(ob,do_unlink=True)
for name in ['18 | exterior window glazing','19 | dimensional city outside window']:
    old=scene.objects.get(name)
    if old:
        for ob in list(old.children):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
def exterior_mat(name,h,rough=.8,metal=0):
    return bpy.data.materials.get(name) or mat(name,h,rough,metal)
aluminum=exterior_mat('Window | charcoal aluminum frames','484b47',.3,.65)
gasket=exterior_mat('Window | dark rubber seals','222925',.85)
for ob in scene.objects:
    if ob.name.startswith(('Aluminum window mullion','Window horizontal frame')):
        ob.data.materials.clear();ob.data.materials.append(aluminum)
group=section('18 | exterior window glazing')
clear=exterior_mat('Window | clear exterior glazing','f8fcff',.025)
bs=clear.node_tree.nodes['Principled BSDF']
bs.inputs['Transmission Weight'].default_value=1;bs.inputs['IOR'].default_value=1.45
for lo,hi in [(-2.4,.02),(.02,2.5),(2.5,4.98),(4.98,7.4)]:
    for bottom,top in [(1.48,3.05),(3.05,4.88)]:
        cube('Exterior window | clear pane',(9.337,(bottom+top)/2,(lo+hi)/2),(.014,top-bottom-.065,hi-lo-.07),clear,.001)
        for z in [lo+.039,hi-.039]:
            cube('Exterior window | vertical rubber seal',(9.307,(bottom+top)/2,z),(.022,top-bottom-.06,.012),gasket,.002)
        for y in [bottom+.036,top-.036]:
            cube('Exterior window | horizontal rubber seal',(9.307,y,(lo+hi)/2),(.022,.012,hi-lo-.065),gasket,.002)
for z in [.105,4.895]:
    for y in [2.03,2.33]:rod('Window latch standoff',(9.29,y,z),(9.19,y,z),.018,aluminum)
    rod('Window vertical handle',(9.19,2.03,z),(9.19,2.33,z),.025,aluminum)

group=section('19 | dimensional city outside window')
city_meshes={};city_batches={}
def city_box(name,p,s,m,bevel=0):
    # Shared cube datablocks avoid thousands of dependency-graph operator updates.
    if name in ['City tower | inset facade window','City tower | side window','City tower | facade ledge']:
        vertices,faces=city_batches.setdefault(m.name,([],[]));offset=len(vertices)
        corners=[(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),
                 (-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]
        vertices.extend(tuple(p[k]+corner[k]*s[k] for k in range(3)) for corner in corners)
        faces.extend(tuple(offset+i for i in face) for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        return
    if m.name not in city_meshes:
        me=bpy.data.meshes.new('City unit box | '+m.name)
        me.from_pydata([(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),
                       (-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)],[],
                      [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        me.materials.append(m);city_meshes[m.name]=me
    ob=bpy.data.objects.new(name,city_meshes[m.name]);scene.collection.objects.link(ob)
    ob.parent=group;ob.location=v(p);ob.scale=(s[0],s[2],s[1])
    return ob
facades=[exterior_mat('Exterior | facade '+str(i),h,.8) for i,h in enumerate(['a9a398','8f9c9d','c4beb1','758b94'])]
concrete=exterior_mat('Exterior | rooftop concrete','9b9b91',.84)
dark=exterior_mat('Exterior | unlit windows','334e5b',.22,.3)
lit=exterior_mat('Exterior | lit windows','627e87',.25,.2)
base=exterior_mat('Exterior | ground and lower roofs','737e77',.9)
city_box('City ground well below the lounge',(26,-12.25,2.5),(35,.2,54),base)
cityrng=random.Random(617)
# Near and far rows provide parallax from the seats; no facade is on the glass.
for row,xbase in [(0,15.3),(1,25.8)]:
    for i in range(8):
        z=-17+i*5.5+row*1.8
        x=xbase+cityrng.uniform(-1.2,1.8);width=cityrng.uniform(2.5,3.8);depth=cityrng.uniform(2.5,4)
        height=cityrng.uniform(12,23);bottom=-12;top=bottom+height
        city_box('City tower | solid volume',(x,bottom+height/2,z),(depth,height,width),facades[(i+row)%4])
        city_box('City tower | roof coping',(x,top+.06,z),(depth+.12,.12,width+.12),concrete)
        city_box('City tower | rooftop plant',(x+.15,top+.4,z+.15),(depth*.45,.65,width*.42),concrete)
        if i%3==0:rod('City tower | rooftop antenna',(x,top+.6,z),(x,top+1.65,z),.025,aluminum)
        columns=max(3,int(width/.65));floors=int((height-.55)/.85)
        for floor in range(floors):
            y=bottom+.65+floor*.85
            for col in range(columns):
                zz=z-width/2+(col+.5)*width/columns
                m=lit if cityrng.random()<.4 else dark
                city_box('City tower | inset facade window',(x-depth/2-.012,y,zz),(.024,.48,width/columns*.56),m)
            if floor%4==0:
                city_box('City tower | facade ledge',(x-depth/2-.05,y-.32,z),(.12,.05,width),concrete)
        # Side windows make building depth legible when looking across the room.
        for floor in range(1,floors,2):
            for xx in [x-depth*.25,x+depth*.25]:
                city_box('City tower | side window',(xx,bottom+.65+floor*.85,z-width/2-.015),(.45,.48,.025),dark)
for name,(vertices,faces) in city_batches.items():mesh('City facade details | '+name,vertices,faces,bpy.data.materials[name])
scene['windowRevision']='Transparent exterior glazing, latches and seals; solid near/far city geometry, no blue backdrop'
bpy.context.view_layer.update()
