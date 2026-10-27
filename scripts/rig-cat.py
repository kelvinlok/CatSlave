"""Build a cat's native Blender deformation rig and continuous skin.

Called by the cat builders, or run against an unrigged source with Blender -b.
UVs are transferred from the authored coat; all skin weights are saved/exported.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform, closest_point_on_tri

ROOT=Path(__file__).resolve().parents[1]
HEAD_SURFACE=None
BODY_SURFACE=None
TAIL_SURFACE=None
def v(p): return Vector((p[0],-p[2],p[1]))
def game(p): return Vector((p[0],p[2],-p[1]))
def smooth(x):
    x=max(0.,min(1.,x));return x*x*(3-2*x)

def skin_weights(p):
    """Anatomical envelopes, continuous over joined skin, normalized to 4 bones."""
    x,y,z=p; w={'DEF_body':1.}
    def blend(target,amount):
        amount=max(0.,min(1.,amount))
        for k in list(w):w[k]*=1-amount
        for k,value in target.items():w[k]=w.get(k,0)+value*amount
    # Shoulder/hip envelopes taper into the torso instead of ending at a cap.
    i=(1 if x>0 else 0)+(0 if z>-.10 else 2)
    legz=.4 if i<2 else -.62
    leg=(1-smooth((y-.46)/.29))*smooth((abs(x)-.055)/.105)*math.exp(-((z-legz)/.27)**4)
    # Full lower-limb influence belongs outside the chest midline. The low
    # belly of a broad cat can also cross y=.35; assigning it to a leg makes
    # a pointed chest flap during grooming and stretching.
    if y<.35 and abs(x)>.12:leg=1.
    low=1-smooth((y-.25)/.16);paw=1-smooth((y-.09)/.14)
    limb={f'DEF_leg{i}':1-low,f'DEF_lowerLeg{i}':low*(1-paw),f'DEF_paw{i}':low*paw}
    blend(limb,leg)
    # Neck blend preserves the muzzle/head while spreading turns into the chest.
    if HEAD_SURFACE is not None:
        # Distance-painted neck blend keeps dorsal markings on the torso.
        # A height-only envelope accidentally pulled shoulder patches into turns.
        dhead=HEAD_SURFACE.find_nearest(v(p))[3]
        dbody=BODY_SURFACE.find_nearest(v(p))[3]
        head=smooth(.5+(dbody-dhead)/.20)
    else:
        head=smooth(max((y-.70)/.24,(z-.30)/.25))*smooth((y-.60)/.16)*smooth((z-.12)/.20)
    # Two intermediate neck joints distribute head turns over three shorter
    # blends instead of collapsing a wide body/head blend into a corkscrew.
    necknodes=['DEF_body','DEF_neckBase','DEF_neckTop','DEF_head']
    along=head*3;a=min(3,int(along));t=along-a
    if a==0:blend({'DEF_neckBase':1.},t)
    else:
        w={necknodes[a]:1-t}
        if a<3:w[necknodes[a+1]]=t
    if y>1.17 and z>.38:
        ear=smooth((y-1.17)/.15)*smooth((abs(x)-.10)/.09)
        blend({f'DEF_ear{1 if x>0 else 0}':1.},ear)
    tail=smooth((y-.79)/.12)*smooth((-z-.64)/.09)
    if TAIL_SURFACE is not None:
        # Wide plumes cross the old Z cutoff. Paint by anatomical ownership
        # so the entire circumference follows the tail, with a soft root blend.
        dtail=TAIL_SURFACE.find_nearest(v(p))[3]
        dbody=BODY_SURFACE.find_nearest(v(p))[3]
        tail=smooth(.5+(dbody-dtail)/.12)
    if tail>0:
        along=max(0,min(4,(y-.82)/.18));a=int(along);b=min(4,a+1);t=along-a
        tw={f'DEF_tailJoint{a}':1-t};tw[f'DEF_tailJoint{b}']=tw.get(f'DEF_tailJoint{b}',0)+t
        blend(tw,tail)
    items=sorted(((k,val) for k,val in w.items() if val>1e-5),key=lambda kv:-kv[1])[:4]
    total=sum(val for k,val in items)
    return {k:val/total for k,val in items}

def rig_character(scene,root,tail_surface_weighting=False):
    global HEAD_SURFACE,BODY_SURFACE,TAIL_SURFACE
    TAIL_SURFACE=None
    label=root.name.removesuffix('_Blender')
    if any(o.type=='ARMATURE' for o in root.children_recursive):
        raise RuntimeError('Rig an unrigged surface source; refusing to stack rigs.')
    parts={o.name:o for o in root.children_recursive if o.type=='EMPTY'}
    parts['tail'].rotation_euler=(0,0,0)
    for o in root.children_recursive:o.hide_viewport=False;o.hide_render=False;o.hide_set(False)
    bpy.context.view_layer.update()
    meshes=[o for o in root.children_recursive if o.type=='MESH']
    coatmeshes=[o for o in meshes if any('short dense coat' in m.name for m in o.data.materials)]
    furmeshes=[o for o in meshes if any('tapered guard hairs' in m.name for m in o.data.materials)]
    details=[o for o in meshes if o not in coatmeshes and o not in furmeshes]
    coat=coatmeshes[0].data.materials[0];furmat=furmeshes[0].data.materials[0]
    import bmesh
    # The old segmented lofts had open end rings hidden inside adjacent parts.
    # Close those volumes before a union, otherwise voxel remeshing makes shells.
    for ob in coatmeshes:
        bm=bmesh.new();bm.from_mesh(ob.data)
        cap_layer=bm.faces.layers.int.new('rig_cap')
        boundary=[e for e in bm.edges if e.is_boundary]
        if boundary:
            filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
            for face in filled['faces']:face[cap_layer]=1
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(ob.data);bm.free();ob.data.update()
    print('RIG: collecting surface UVs',flush=True)
    vertices=[];triangles=[];uvtri=[];source_slots=[];source_objects=[]
    for ob in coatmeshes:
        ob.data.calc_loop_triangles();offset=len(vertices)
        vertices.extend([ob.matrix_world@vert.co for vert in ob.data.vertices])
        uv=ob.data.uv_layers.active
        for tri in ob.data.loop_triangles:
            # New internal caps close volumes only. Their default (0,0) UVs
            # are not painted coat and must never be used for atlas transfer.
            if ob.data.attributes['rig_cap'].data[tri.polygon_index].value:continue
            triangles.append(tuple(offset+i for i in tri.vertices))
            uvtri.append(tuple(Vector((*uv.data[li].uv,0)) for li in tri.loops))
            source_slots.append(ob.parent.name)
            source_objects.append(ob.name)
    surface=BVHTree.FromPolygons(vertices,triangles,all_triangles=True)
    HEAD_SURFACE=BVHTree.FromPolygons(vertices,[tri for tri,slot in zip(triangles,source_slots) if slot=='head'],all_triangles=True)
    BODY_SURFACE=BVHTree.FromPolygons(vertices,[tri for tri,slot in zip(triangles,source_slots) if slot=='body'],all_triangles=True)
    if tail_surface_weighting:
        TAIL_SURFACE=BVHTree.FromPolygons(vertices,[tri for tri,slot in zip(triangles,source_slots) if slot=='tail'],all_triangles=True)
    # Add continuous shoulder and hip tissue before the union. The old joint
    # pieces only intersected at narrow caps, leaving an artificial tube contour.
    for side in [-1,1]:
        for front in [True,False]:
            center=(side*(.205 if front else .215),.635,.40 if front else -.61)
            scale=(.125,.19,.14) if front else (.155,.19,.175)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=v(center))
            bridge=bpy.context.object;bridge.scale=(scale[0],scale[2],scale[1]);bridge.data.materials.append(coat)
            coatmeshes.append(bridge)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in coatmeshes:ob.select_set(True)
    skin=coatmeshes[0];bpy.context.view_layer.objects.active=skin
    bpy.ops.object.join()
    world=skin.matrix_world.copy();skin.parent=root;skin.matrix_world=world
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    # Voxel union removes the original limb/neck caps; smooth continuous topology.
    remesh=skin.modifiers.new('Unified anatomical surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.010;remesh.use_smooth_shade=True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    sm=skin.modifiers.new('Soften shoulder and hip transitions','SMOOTH');sm.factor=.8;sm.iterations=4
    bpy.ops.object.modifier_apply(modifier=sm.name)
    region=skin.vertex_groups.new(name='Joint tissue smoothing')
    for vert in skin.data.vertices:
        x,y,z=game(vert.co)
        limb=math.exp(-((z-(.40 if z>-.1 else -.61))/.23)**4)*smooth((abs(x)-.10)/.10)
        amount=limb*max(math.exp(-((y-.60)/.14)**2),math.exp(-((y-.32)/.075)**2),math.exp(-((y-.13)/.065)**2))
        if amount>.01:region.add([vert.index],amount,'REPLACE')
    sm=skin.modifiers.new('Rounded shoulder elbow and hock tissue','SMOOTH');sm.factor=1.;sm.iterations=12;sm.vertex_group=region.name
    bpy.ops.object.modifier_apply(modifier=sm.name)
    dec=skin.modifiers.new('Realtime deformation surface','DECIMATE');dec.ratio=.45
    bpy.ops.object.modifier_apply(modifier=dec.name)
    skin.name=f'{label}_ContinuousSkin';skin.data.name=f'{label} continuous manifold skin'
    # Discard only detached remesh debris, then verify the main surface is closed.
    import bmesh
    bm=bmesh.new();bm.from_mesh(skin.data);bm.verts.ensure_lookup_table()
    components=[];remaining=set(bm.verts)
    while remaining:
        seed=remaining.pop();component={seed};stack=[seed]
        while stack:
            node=stack.pop()
            for edge in node.link_edges:
                other=edge.other_vert(node)
                if other in remaining:remaining.remove(other);component.add(other);stack.append(other)
        components.append(component)
    components.sort(key=len,reverse=True)
    if len(components)>1:
        if any(len(c)>100 for c in components[1:]):
            bounds=[{'size':len(c),'center':tuple(game(sum((vert.co for vert in c),Vector())/len(c)))} for c in components[:12]]
            raise RuntimeError(f'Disconnected anatomy: {bounds}')
        bmesh.ops.delete(bm,geom=[v for c in components[1:] for v in c],context='VERTS')
    boundary=sum(1 for e in bm.edges if not e.is_manifold)
    bm.to_mesh(skin.data);bm.free()
    if boundary:raise RuntimeError(f'Unified skin has {boundary} non-manifold edges')
    for attr in list(skin.data.color_attributes):skin.data.color_attributes.remove(attr)
    for uv in list(skin.data.uv_layers):skin.data.uv_layers.remove(uv)
    skin.data.materials.clear();skin.data.materials.append(coat)
    uv=skin.data.uv_layers.new(name='CoatUV')
    print('RIG: transferring coat atlas',len(skin.data.vertices),'vertices',flush=True)
    pointUV=[];pointSource=[]
    for vertex in skin.data.vertices:
        hit,normal,index,distance=surface.find_nearest(vertex.co)
        a,b,c=[vertices[i] for i in triangles[index]];ua,ub,uc=uvtri[index]
        pointUV.append(barycentric_transform(hit,a,b,c,ua,ub,uc))
        pointSource.append(source_objects[index])
    for poly in skin.data.polygons:
        poly.use_smooth=True;poly.material_index=0
        center=sum((skin.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        hit,normal,index,distance=surface.find_nearest(center)
        a,b,c=[vertices[i] for i in triangles[index]];ua,ub,uc=uvtri[index]
        for li in poly.loop_indices:
            p=skin.data.vertices[skin.data.loops[li].vertex_index].co
            projected=closest_point_on_tri(p,a,b,c)
            value=barycentric_transform(projected,a,b,c,ua,ub,uc)
            # A shared UV per vertex inside each island avoids splitting every
            # exported triangle due to tiny barycentric floating-point differences.
            shared=pointUV[skin.data.loops[li].vertex_index]
            if pointSource[skin.data.loops[li].vertex_index]==source_objects[index] and (shared-value).length<.02:value=shared
            uv.data[li].uv=(value.x,value.y)
    # The complete Blender armature owns bind transforms and all deformation weights.
    armdata=bpy.data.armatures.new(f'{label} anatomical skeleton')
    arm=bpy.data.objects.new(f'{label}_Armature',armdata);scene.collection.objects.link(arm);arm.parent=root
    arm.show_in_front=True;armdata.display_type='OCTAHEDRAL'
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='EDIT')
    rest={name:game(ob.matrix_world.translation) for name,ob in parts.items()}
    rest['neckBase']=Vector((0,.78,.38));rest['neckTop']=Vector((0,.89,.48))
    parentmap={'neckBase':'body','neckTop':'neckBase','head':'neckTop','tail':'body'}
    for i in range(4):parentmap.update({f'leg{i}':'body',f'lowerLeg{i}':f'leg{i}',f'paw{i}':f'lowerLeg{i}'})
    for i in range(2):parentmap.update({f'ear{i}':'head',f'eye{i}':'head',f'closedEye{i}':'head'})
    for i in range(5):
        name=f'tailJoint{i}';rest[name]=Vector((0,.82+i*.18,-.76));parentmap[name]='tail' if i==0 else f'tailJoint{i-1}'
    names=['body','neckBase','neckTop','head']+[f'{p}{i}' for i in range(4) for p in ['leg','lowerLeg','paw']]+[f'{p}{i}' for i in range(2) for p in ['ear','eye','closedEye']]+['tail']+[f'tailJoint{i}' for i in range(5)]
    for name in names:
        bone=armdata.edit_bones.new('DEF_'+name);p=rest[name]
        if name=='body':p=Vector((0,.68,-.25));end=Vector((0,.72,.35))
        elif name=='head':end=p+Vector((0,.23,.08))
        elif name.startswith(('leg','lowerLeg')):end=p+Vector((0,-.25,0))
        elif name.startswith('paw'):end=p+Vector((0,0,.13))
        else:end=p+Vector((0,.18 if name.startswith(('ear','tail')) else .035,0))
        bone.head=v(p);bone.tail=v(end)
    for name,parent in parentmap.items():armdata.edit_bones['DEF_'+name].parent=armdata.edit_bones['DEF_'+parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    def bind(ob,weights):
        world=ob.matrix_world.copy();ob.parent=arm;ob.matrix_world=world
        ob.vertex_groups.clear()
        groups={b.name:ob.vertex_groups.new(name=b.name) for b in armdata.bones}
        for i,ww in enumerate(weights):
            for name,weight in ww.items():groups[name].add([i],weight,'REPLACE')
        mod=ob.modifiers.new(f'{label} native skeletal deformation','ARMATURE');mod.object=arm;mod.use_deform_preserve_volume=False
    bind(skin,[skin_weights(game(vertex.co)) for vertex in skin.data.vertices])
    print('RIG: binding guard hairs',flush=True)
    skin.data.calc_loop_triangles()
    newSurface=BVHTree.FromPolygons([vert.co for vert in skin.data.vertices],[tri.vertices for tri in skin.data.loop_triangles],all_triangles=True)
    fv=[];ff=[];fc=[];fw=[]
    for ob in furmeshes:
        attr=ob.data.color_attributes.get('Coat')
        # Builder emits each tapered strand as five vertices and two polygons.
        for start in range(0,len(ob.data.vertices),5):
            strand=[ob.matrix_world@ob.data.vertices[start+k].co for k in range(5)]
            base=(strand[0]+strand[1])*.5
            hit,n,index,dist=newSurface.find_nearest(base)
            if dist>.027:continue # Internal hairs at old overlapping part boundaries.
            delta=hit+n*.0015-base;offset=len(fv)
            fv.extend([tuple(p+delta) for p in strand]);ff.extend([(offset,offset+1,offset+2,offset+3),(offset+3,offset+2,offset+4)])
            fc.extend([tuple(attr.data[start+k].color) for k in range(5)])
            fw.extend([skin_weights(game(hit))]*5)
    data=bpy.data.meshes.new(f'{label} skinned coat fibres');data.from_pydata(fv,[],ff);data.materials.append(furmat)
    fur=bpy.data.objects.new(f'{label}_SkinnedFur',data);scene.collection.objects.link(fur)
    attr=data.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT')
    for i,col in enumerate(fc):attr.data[i].color=col
    bind(fur,fw)
    for ob in furmeshes:bpy.data.objects.remove(ob,do_unlink=True)
    # Details keep their own materials; their weights are authored too.
    for ob in details:
        parent=ob.parent
        while parent and parent.name not in rest:parent=parent.parent
        slot=parent.name if parent else 'head'
        if slot.startswith(('eye','closedEye')):ob['visibilitySlot']=slot
        world=ob.matrix_world.copy()
        bone='DEF_'+slot
        bind(ob,[{bone:1.} for vert in ob.data.vertices])
    root['modelRig']='blender-armature';root['source']=f'Blender authored {label} v2 — continuous skinned body'
    skin['surfaceComponents']=1;skin['nonManifoldEdges']=boundary
    skin['weightPolicy']='Blender authored anatomical envelopes, four normalized influences'
    print('RIG: complete',len(armdata.bones),'bones',len(skin.data.vertices),'skin vertices',flush=True)
    return arm,skin

def export_and_save(scene,root,arm,skin):
    kind=root.name.removesuffix('_Blender').lower()
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root,*root.children_recursive]:
        o.hide_viewport=False;o.hide_render=False;o.hide_set(False);o.select_set(True)
    glb=ROOT/f'public/models/{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=False,export_extras=True,export_image_format='JPEG',export_jpeg_quality=85,export_skins=True,export_animations=False)
    for ob in root.children_recursive:
        if str(ob.get('visibilitySlot','')).startswith('closedEye'):ob.hide_render=True;ob.hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'assets/{kind}/{kind}.blend'))
    report={'bones':len(arm.data.bones),'skin_vertices':len(skin.data.vertices),'skin_triangles':sum(len(p.vertices)-2 for p in skin.data.polygons),'surface_components':skin['surfaceComponents'],'non_manifold_edges':skin['nonManifoldEdges'],'glb_bytes':glb.stat().st_size}
    (ROOT/f'artifacts/{kind}-rig').mkdir(exist_ok=True)
    (ROOT/f'artifacts/{kind}-rig/rig-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report),flush=True)

if __name__=='__main__':
    scene=bpy.context.scene;root=next(o for o in scene.objects if o.name.endswith('_Blender'))
    arm,skin=rig_character(scene,root)
    export_and_save(scene,root,arm,skin)
