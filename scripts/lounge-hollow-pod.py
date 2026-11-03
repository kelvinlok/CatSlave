"""Hollow bentwood hideaway, matching the user's opening/glass-top annotation.
Runs with the room generator's mesh helpers. All dimensions in game axes.
"""
group=scene.objects['08 | flower beds and rounded cat hideaway']
for ob in list(group.children):
    if ob.name.startswith(('Mustard raised cat pod','Pod angled timber leg','Pod |')):
        bpy.data.objects.remove(ob,do_unlink=True)
shellmat=mat('Pod | honey bentwood','ae7b3c',.54)
inside=mat('Pod | soft linen inner pad','c7b595',.98)
glassmat=mat('Pod | transparent glass lid','f4fcff',.065)
bs=glassmat.node_tree.nodes['Principled BSDF']
bs.inputs['Transmission Weight'].default_value=1.0
bs.inputs['IOR'].default_value=1.45
bs.inputs['Coat Weight'].default_value=.2

# Outer and inner surfaces form a continuous wall, joined only at the top rim
# and underside. There is no solid sphere or opaque disk inside the cavity.
outer=[(.43,.30),(.46,.45),(.55,.60),(.72,.68),(.90,.66),(1.07,.59),(1.16,.52)]
inner=[(.49,.30),(.51,.43),(.58,.55),(.73,.625),(.90,.605),(1.07,.535),(1.16,.47)]
n=64;verts=[];faces=[]
for profile in [outer,inner]:
    for y,r in profile:
        for i in range(n):
            a=i*2*pi/n;verts.append((2.1+r*cos(a),y,-7.05+r*.74*sin(a)))
offset=len(outer)*n
for j in range(len(outer)-1):
    for i in range(n):
        a=j*n+i;b=j*n+(i+1)%n;c=(j+1)*n+(i+1)%n;d=(j+1)*n+i
        # Reversed inner winding makes its normals face the cavity.
        faces.extend([(a,d,c,b),(offset+a,offset+b,offset+c,offset+d)])
for i in range(n):
    a=(len(outer)-1)*n+i;b=(len(outer)-1)*n+(i+1)%n
    faces.append((a,offset+a,offset+b,b))
faces.append(tuple(range(n)))
faces.append(tuple(offset+i for i in range(n-1,-1,-1)))
pod=mesh('Pod | hollow bentwood shell',verts,faces,shellmat)
for face in pod.data.polygons:face.use_smooth=len(face.vertices)==4

# A cylindrical passage removes the front wall and reveals the real interior.
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.275,depth=.90,location=v((2.1,.79,-6.65)),rotation=(pi/2,0,0))
cut=bpy.context.object;cut.name='Temporary pod doorway cutter'
mod=pod.modifiers.new('Open side entrance','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cut
bpy.context.view_layer.objects.active=pod;pod.select_set(True)
bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
bevel=pod.modifiers.new('Rounded bentwood opening edge','BEVEL');bevel.width=.008;bevel.segments=2
pod.modifiers.new('Bentwood surface normals','WEIGHTED_NORMAL')
ellipsoid('Pod | inner linen cushion',(2.1,.525,-7.09),(.38,.035,.28),inside)

# Separate thin elliptical glass pane seated inside the wooden top lip.
gv=[];gf=[]
for y in [1.157,1.171]:
    for i in range(n):
        a=i*2*pi/n;gv.append((2.1+.475*cos(a),y,-7.05+.475*.74*sin(a)))
gf.extend([tuple(range(n)),tuple(n+i for i in range(n-1,-1,-1))])
for i in range(n):gf.append((i,i+n,(i+1)%n+n,(i+1)%n))
lid=mesh('Pod | removable transparent glass top',gv,gf,glassmat)
lid['material_intent']='Clear colorless glass, not a blue opaque top'
for x in [1.65,2.55]:
    for z in [-7.3,-6.8]:rod('Pod angled timber leg',(x,.03,z),(2.1+(x-2.1)*.8,.50,-7.05+(z+7.05)*.8),.035,wood)
pod['construction']='Hollow wall with real side entrance and separate clear glass lid'
bpy.context.view_layer.update()
