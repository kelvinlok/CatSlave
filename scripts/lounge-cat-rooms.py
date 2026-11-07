"""Eight bedrooms only in the mural-end slice of the left cubby wall.

Invoked by build-lounge.py after the authored layout corrections. For incremental
export, open assets/lounge/lounge.blend and execute with CAT_ROOMS_INCREMENTAL=True.
Set CAT_ROOMS_SKIP_RENDER=True for geometry-only incremental exports.
Keeps the adjacent storage and grid, and does not rewrite layout/furniture metadata.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

ROOM_ROOT=Path(__file__).resolve().parents[1] if 'ROOT' not in globals() else ROOT
room_scene=bpy.context.scene
room_parent=room_scene.objects['CatLounge']
room_art=ROOM_ROOT/'artifacts/cat-rooms';room_art.mkdir(parents=True,exist_ok=True)
def room_v(p):return Vector((p[0],-p[2],p[1]))

def build_cat_rooms():
    bpy.context.view_layer.update()
    # Only trim geometry belonging to the old cubby/grid section. All fixtures
    # are axis-aligned authored cuboids; changing Y bounds preserves their bevels.
    legacy=room_scene.objects['04 | walnut cubbies and black grid screen']
    trimmed=[];removed=[]
    for ob in list(legacy.children):
        if ob.type!='MESH':continue
        corners=[ob.matrix_world@Vector(p) for p in ob.bound_box]
        lo=min(-p.y for p in corners);hi=max(-p.y for p in corners)
        if lo>=-5.7-1e-5:continue
        if hi<=-5.7+1e-5:
            removed.append(ob.name);bpy.data.objects.remove(ob,do_unlink=True);continue
        new_lo=-5.7
        # Source meshes here have local Y aligned with Blender/world Y.
        factor=(hi-new_lo)/(hi-lo)
        ob.scale.y*=factor
        ob.location.y=-(new_lo+hi)/2
        trimmed.append(ob.name)
    old=room_scene.objects.get('23 | eight cat bedrooms')
    if old:
        for ob in list(old.children_recursive):bpy.data.objects.remove(ob,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
    group=bpy.data.objects.new('23 | eight cat bedrooms',None);room_scene.collection.objects.link(group);group.parent=room_parent
    group['construction']='Two columns, four rows; only mural-end narrow cubby slice'
    group['roomBounds']='x[-7.7,-6.35], z[-7.6,-5.7], y[0,4.9]; all landings to x=-5.80; upper landings to z=-5.20'
    group['sleepingHeights']='0.18,1.38,2.58,3.78'
    def material(name,color):
        m=bpy.data.materials.get(name)
        if m:return m
        m=bpy.data.materials.new(name);m.use_nodes=True
        c=tuple(int(color[i:i+2],16)/255 for i in (0,2,4));c=tuple(x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4 for x in c)
        m.diffuse_color=(*c,1);p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.88
        return m
    oak=bpy.data.materials['Pale oak furniture'];black=bpy.data.materials['Black powder-coated steel']
    linen=material('Bedrooms | oatmeal linen','d6cab4');sage=material('Bedrooms | sage cushions','8fa58c');rose=material('Bedrooms | dusty rose cushions','c8a098')
    ivory=material('Bedrooms | ivory room labels','f1e8d2');seam=material('Bedrooms | cushion piping','e6dbbf')
    def cube(name,p,size,mat,bevel=.012):
        bpy.ops.mesh.primitive_cube_add(size=1,location=room_v(p));ob=bpy.context.object;ob.name=name;ob.parent=group
        ob.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(mat)
        if bevel:
            mod=ob.modifiers.new('Rounded joinery','BEVEL');mod.width=bevel;mod.segments=3
            ob.modifiers.new('Soft normals','WEIGHTED_NORMAL')
        return ob
    def rod(name,points,r,mat):
        curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=1
        spline=curve.splines.new('POLY');spline.points.add(len(points)-1)
        for p,co in zip(spline.points,points):p.co=(*room_v(co),1)
        ob=bpy.data.objects.new(name,curve);room_scene.collection.objects.link(ob);ob.parent=group;ob.data.materials.append(mat)
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH');return bpy.context.object
    # Enclosure occupies exactly the indicated rear slice; front faces stay open.
    cube('Bedrooms | pale oak back',(-7.665,2.44,-6.65),(.07,4.88,1.9),oak)
    for z in [-7.565,-6.65,-5.735]:
        cube('Bedrooms | full-height divider',(-7.0,2.44,z),(1.3,4.88,.07),oak)
        cube('Bedrooms | black front upright',(-6.335,2.44,z),(.055,4.88,.055),black,.008)
    cube('Bedrooms | crown',(-7.0,4.865,-6.65),(1.4,.07,1.9),oak)
    rooms=[]
    for row,floor in enumerate([.18,1.38,2.58,3.78]):
        cube('Bedrooms | tier floor',(-7.0,floor-.14,-6.65),(1.3,.08,1.9),oak)
        # The upper two landings extend beyond the side divider, letting cats
        # walk around its face before a straight jump to the adjacent cabinet.
        # Lane x=-6.04 clears the black uprights; launch z=-5.45 clears the side.
        ledge_front=-5.80
        ledge_end=-5.20 if row>=2 else -5.70
        ledge_x=(-6.37+ledge_front)/2;ledge_z=(-7.60+ledge_end)/2
        ledge_width=ledge_front+6.37;ledge_depth=ledge_end+7.60
        cube('Bedrooms | landing tier '+str(row+1),(ledge_x,floor-.04,ledge_z),(ledge_width,.08,ledge_depth),oak,.018)
        cube('Bedrooms | landing black edge',(ledge_front-.005,floor-.045,ledge_z),(.025,.065,ledge_depth),black,.008)
        for col,z in enumerate([-7.10,-6.20]):
            number=row*2+col+1;prefix='Bedroom %02d | '%number
            cushion=sage if (row+col)%2==0 else rose
            bed=cube(prefix+'mattress',(-6.95,floor-.05,z),(1.03,.10,.74),cushion,.045);bed['catBedroom']=number
            cube(prefix+'back pillow',(-7.43,floor+.075,z),(.20,.16,.60),linen,.065)
            # Fine cushion welt follows a rounded rectangle in the sleeping plane.
            points=[]
            for cx,cz,start in [(-7.39,z-.28,math.pi),(-6.51,z-.28,math.pi*1.5),(-6.51,z+.28,0),(-7.39,z+.28,math.pi*.5)]:
                for i in range(7):
                    a=start+i/6*math.pi*.5;points.append((cx+math.cos(a)*.055,floor-.038,cz+math.sin(a)*.055))
            points.append(points[0]);rod(prefix+'stitched welt',points,.004,seam)
            # Small numbers sit above each opening, leaving the interior unobstructed.
            header=floor+.97
            cube(prefix+'header rail',(-6.335,header,z),(.06,.09,.86),black,.008)
            cube(prefix+'number plaque',(-6.295,header,z),(.022,.085,.13),ivory,.009)
            curve=bpy.data.curves.new(prefix+'number','FONT');curve.body=str(number);curve.size=.065;curve.align_x='CENTER';curve.align_y='CENTER';curve.extrude=.0008
            ob=bpy.data.objects.new(prefix+'number',curve);room_scene.collection.objects.link(ob);ob.parent=group;ob.location=room_v((-6.28,header,z))
            ob.rotation_euler=Matrix(((0,0,1),(1,0,0),(0,1,0))).to_euler();ob.data.materials.append(black)
            bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
            marker=bpy.data.objects.new('CatBedroom_%02d'%number,None);room_scene.collection.objects.link(marker);marker.parent=group;marker.location=room_v((-6.95,floor,z));marker['catBedroom']=number
            rooms.append({'number':number,'center':[-6.95,floor,z],'entry':[-6.15,floor,z]})
    room_scene['catBedroomRevision']='8 rooms in far narrow cubby slice; 2 columns by 4 rows'
    bpy.context.view_layer.update()
    (room_art/'bedroom-layout.json').write_text(json.dumps({'rooms':rooms,'trimmed':trimmed,'removed':removed},indent=2))
    print('CAT_BEDROOMS',json.dumps({'rooms':len(rooms),'trimmed':trimmed,'removed':removed}),flush=True)
    return group

bedroom_group=build_cat_rooms()

if globals().get('CAT_ROOMS_INCREMENTAL',False):
    # Export the existing scene without prepare_furniture: preserve the user's
    # latest manifest and all existing ownership/pivots, including the wheel.
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOM_ROOT/'assets/lounge/lounge.blend'))
    exec((ROOM_ROOT/'scripts/lounge-furniture-export.py').read_text(encoding='utf-8'))
    pivots={ob['furnitureId']:ob for ob in room_scene.objects if ob.type=='EMPTY' and ob.get('furnitureId')}
    copies,stats=export_furniture_room(room_scene,room_parent,pivots,ROOM_ROOT/'public/models/lounge.glb')
    (ROOM_ROOT/'assets/lounge/model-stats.json').write_text(json.dumps(stats,indent=2)+'\n')
    for ob in copies:bpy.data.objects.remove(ob,do_unlink=True)
    if not globals().get('CAT_ROOMS_SKIP_RENDER',False):
        # Local visual evidence includes neighboring grid/cubbies to confirm scope.
        cam_data=bpy.data.cameras.new('Eight rooms closeup');cam=bpy.data.objects.new('Eight rooms closeup',cam_data);room_scene.collection.objects.link(cam)
        cam.location=room_v((-2.5,3.0,-3.8));target=room_v((-6.9,2.45,-6.2));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam_data.type='ORTHO';cam_data.ortho_scale=6.3;room_scene.camera=cam
        room_scene.render.resolution_x=1100;room_scene.render.resolution_y=1100;room_scene.render.resolution_percentage=100;room_scene.cycles.samples=20
        room_scene.render.filepath=str(room_art/'eight-bedrooms.png');bpy.ops.render.render(write_still=True)
