"""Rebuild Momo's coat as independent fine curves, plus a skinned realtime strand proxy.
Run after build-momo.py, or against assets/momo/momo.blend. No other cats are changed.
"""
import bpy, numpy as np, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/momo-soft-groom';OUT.mkdir(exist_ok=True,parents=True)
scene=bpy.context.scene;skin=bpy.data.objects['Momo_ContinuousSkin'];root=bpy.data.objects['Momo_Blender'];arm=bpy.data.objects['Momo_Armature']
for ob in list(root.children_recursive):
 if ob.name=='Momo_SkinnedFur' or ob.name.startswith('Momo_SoftHair'):bpy.data.objects.remove(ob,do_unlink=True)
# Quiet undercoat: the visible texture should come from fibres, not embossed scales.
coat=skin.data.materials[0]
for node in coat.node_tree.nodes:
 if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.04
# Give each attachment triangle its own UV loops. Loop triangles on a quad share
# corners; writing independent UV tiles there overwrites the earlier triangle
# and leaves some native hairs without a valid surface attachment.
bpy.ops.object.select_all(action='DESELECT');skin.hide_set(False);skin.select_set(True);bpy.context.view_layer.objects.active=skin
triangulate=skin.modifiers.new('Unique groom attachment triangles','TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=triangulate.name)
skin.data.calc_loop_triangles();tris=np.array([t.vertices for t in skin.data.loop_triangles],dtype=np.int32)
verts=np.array([v.co[:] for v in skin.data.vertices],dtype=np.float64)
norms=np.array([v.normal[:] for v in skin.data.vertices],dtype=np.float64)
areas=np.array([t.area for t in skin.data.loop_triangles],dtype=np.float64)
centers=verts[tris].mean(axis=1);g=centers[:,[0,2,1]];g[:,2]*=-1
# Prioritize the cheek/chest ruff without clustering roots into bundles.
ruff=(g[:,1]>.62)&(g[:,1]<1.16)&(g[:,2]>.42)
areas*=np.where(ruff,1.7,1.)
rng=np.random.default_rng(83627);COUNT=180000;GAME_COUNT=30000;STEPS=8
ids=rng.choice(len(tris),COUNT,p=areas/areas.sum());r=np.sqrt(rng.random(COUNT));s=rng.random(COUNT)
w=np.column_stack((1-r,r*(1-s),r*s));tv=tris[ids]
roots=np.einsum('ni,nij->nj',w,verts[tv]);normal=np.einsum('ni,nij->nj',w,norms[tv]);normal/=np.linalg.norm(normal,axis=1)[:,None]
x=roots[:,0];y=roots[:,2];z=-roots[:,1];sgn=np.where(x>0,1.,-1.)
# Smooth regional growth fields: down the ruff, back along the saddle, along legs.
length=np.full(COUNT,.070);flow=np.column_stack((sgn*.35,np.full(COUNT,-.60),np.full(COUNT,-.75)))
lift=np.full(COUNT,.62)
neck=(y>.60)&(y<1.15)&(z>.42);length[neck]=.105;flow[neck]=np.column_stack((sgn[neck]*.35,np.full(neck.sum(),-1.),np.full(neck.sum(),.08)));lift[neck]=.72
cheek=(y>.88)&(y<1.19)&(z>.45)&(np.abs(x)>.24);length[cheek]=.085;lift[cheek]=.65
legs=y<.57;length[legs]=.030;flow[legs]=(0,-1,.02);lift[legs]=.35
feet=y<.15;length[feet]=.012
forehead=(y>1.16)&(z>.40);length[forehead]=.025;flow[forehead]=(0,.1,-1);lift[forehead]=.30
ears=(y>1.25)&(np.abs(x)>.21)&(z>.35);length[ears]=.008;lift[ears]=.22
face=(z>.73)&(y>.79)&(y<1.18)&(np.abs(x)<.285)
length[face]=.008;flow[face]=np.column_stack((sgn[face]*.45,np.full(face.sum(),-.7),np.zeros(face.sum())));lift[face]=.20
# Broad plume consists of fine diverging hairs rather than solid long ribbons.
tail=(z<-.58)&(y>.86);length[tail]=.070;flow[tail]=(0,1,0);lift[tail]=.75
# Convert Y-up grooming vectors to Blender Z-up.
flow=flow[:,[0,2,1]];flow[:,1]*=-1
flow-=normal*np.einsum('ij,ij->i',flow,normal)[:,None]
flow/=np.maximum(1e-8,np.linalg.norm(flow,axis=1))[:,None]
side=np.cross(normal,flow);side/=np.maximum(1e-8,np.linalg.norm(side,axis=1))[:,None]
flow+=side*rng.normal(0,.16,COUNT)[:,None];flow/=np.linalg.norm(flow,axis=1)[:,None]
length*=rng.uniform(.72,1.28,COUNT)
# A dense short undercoat and sparse longer guard hairs share the same groom.
undercoat=rng.random(COUNT)<.35;length[undercoat]*=.60
lift*=rng.uniform(.80,1.20,COUNT)
direction=normal*lift[:,None]+flow*.85;direction/=np.linalg.norm(direction,axis=1)[:,None]
t=np.linspace(0,1,STEPS);phase=rng.uniform(0,math.tau,COUNT)
positions=roots[:,None,:]+normal[:,None,:]*.0006+direction[:,None,:]*length[:,None,None]*t[None,:,None]
# Smooth curvature and very small endpoint frizz, with stable roots and zero clump.
positions+=normal[:,None,:]*(np.sin(t*math.pi)*.12)[None,:,None]*length[:,None,None]
positions+=side[:,None,:]*(np.sin(t[None,:]*4.2+phase[:,None])-np.sin(phase)[:,None])[:,:,None]*length[:,None,None]*(t*.035)[None,:,None]
positions[:,:,2]-=length[:,None]*.12*t[None,:]**2
radius=rng.uniform(.00033,.00052,COUNT);radius[face]*=.55;radius[ears]*=.6
radii=radius[:,None]*(.12+.88*(1-t)**.75)[None,:];radii[:,-1]=.000012
# Sample the actual visible coat atlas at the root; no stale region colour patches.
uv=skin.data.uv_layers['CoatUV'];triuv=np.array([[uv.data[li].uv[:] for li in tr.loops] for tr in skin.data.loop_triangles])
rootuv=np.einsum('ni,nij->nj',w,triuv[ids])
im=bpy.data.images['Momo | painted coat atlas'];iw,ih=im.size;pixels=np.array(im.pixels[:],dtype=np.float32).reshape(ih,iw,4)
xx=np.clip(rootuv[:,0]*(iw-1),0,iw-1);yy=np.clip(rootuv[:,1]*(ih-1),0,ih-1);ix=xx.astype(int);iy=yy.astype(int);fx=xx-ix;fy=yy-iy
ix1=np.minimum(ix+1,iw-1);iy1=np.minimum(iy+1,ih-1)
colours=(pixels[iy,ix,:3]*(1-fx)[:,None]*(1-fy)[:,None]+pixels[iy,ix1,:3]*fx[:,None]*(1-fy)[:,None]+pixels[iy1,ix,:3]*(1-fx)[:,None]*fy[:,None]+pixels[iy1,ix1,:3]*fx[:,None]*fy[:,None])
colours=np.clip(colours*rng.uniform(.94,1.06,COUNT)[:,None],.008,.92)
# Unique attachment UVs avoid ambiguities in the painted atlas during deformation.
attach=skin.data.uv_layers.get('GroomUV') or skin.data.uv_layers.new(name='GroomUV')
grid=math.ceil(math.sqrt(len(tris)));step=1/grid
for k,tr in enumerate(skin.data.loop_triangles):
 u=(k%grid+.1)*step;vv=(k//grid+.1)*step
 for li,coord in zip(tr.loops,[(u,vv),(u+.75*step,vv),(u,vv+.75*step)]):attach.data[li].uv=coord
attachuv=np.column_stack(((ids%grid+.1+w[:,1]*.75)*step,(ids//grid+.1+w[:,2]*.75)*step))
rest=skin.data.attributes.get('rest_position') or skin.data.attributes.new('rest_position','FLOAT_VECTOR','POINT');rest.data.foreach_set('vector',verts.astype(np.float32).ravel())
# Native Blender hair curves retain smooth Catmull-Rom strands and physical
# fibre shading. Separate coat regions keep their material assignments explicit.
ng=bpy.data.node_groups.new('Momo | attach fine groom to skinned surface','GeometryNodeTree');ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
a=ng.nodes.new('NodeGroupInput');b=ng.nodes.new('GeometryNodeDeformCurvesOnSurface');c=ng.nodes.new('NodeGroupOutput');ng.links.new(a.outputs['Geometry'],b.inputs['Curves']);ng.links.new(b.outputs['Curves'],c.inputs['Geometry'])
luminance=np.mean(colours,axis=1)
regions=np.where(luminance>.65,0,np.where(luminance>.06,1,2))
# The reference has a white neck ruff below the seal mask, including the bib.
white_ruff=(y>.60)&(y<1.12)&(z>.43)&((np.abs(x)>.28)|(y<.84))
regions[white_ruff]=0
native_grooms=[]
for k,(region,colour) in enumerate([('cream',(.80,.78,.74,1)),('taupe',(.06,.045,.032,1)),('seal',(.025,.018,.012,1))]):
    mask=regions==k;count=int(mask.sum())
    data=bpy.data.hair_curves.new('Momo | '+region+' fine hair');data.add_curves([STEPS]*count);data.set_types(type='CATMULL_ROM')
    data.attributes['position'].data.foreach_set('vector',positions[mask].astype(np.float32).ravel())
    a=data.attributes.new('radius','FLOAT','POINT');a.data.foreach_set('value',radii[mask].astype(np.float32).ravel())
    a=data.attributes.new('surface_uv_coordinate','FLOAT2','CURVE');a.data.foreach_set('vector',attachuv[mask].astype(np.float32).ravel())
    data.surface=skin;data.surface_uv_map='GroomUV'
    hair=bpy.data.objects.new('Momo_SoftHair' if k==0 else 'Momo_SoftHair_'+region,data);scene.collection.objects.link(hair);hair.parent=root
    hair['purpose']='Cycles source groom; realtime proxy exported separately';hair['strand_count']=count;hair['clumping']=0.
    hair.modifiers.new('Follow native skin','NODES').node_group=ng
    mat=bpy.data.materials.new('Momo | '+region+' physical hair');mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear()
    bs=nt.nodes.new('ShaderNodeBsdfHairPrincipled');bs.parametrization='COLOR';bs.inputs['Color'].default_value=colour;bs.inputs['Roughness'].default_value=.40;bs.inputs['Radial Roughness'].default_value=.45;bs.inputs['Random Roughness'].default_value=.10
    output=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(bs.outputs[0],output.inputs['Surface']);data.materials.append(mat);native_grooms.append(hair)
print('Native groom',COUNT,'curves ready',flush=True)
# Game proxy uses individual narrow bent fibres, never converging bundles.
P=positions[:GAME_COUNT][:,[0,2,5,7]];N=normal[:GAME_COUNT];S=side[:GAME_COUNT]
width=radius[:GAME_COUNT]*2.4
pv=np.empty((GAME_COUNT,7,3));pointids=[0,0,1,1,2,2,3]
for j,(k,sign,factor) in enumerate([(0,-1,1),(0,1,1),(1,-1,.9),(1,1,.9),(2,-1,.55),(2,1,.55),(3,0,0)]):pv[:,j]=P[:,k]+S*(width*sign*factor)[:,None]
faces=[]
for i in range(GAME_COUNT):
 k=i*7;faces.extend([(k,k+2,k+3,k+1),(k+2,k+4,k+5,k+3),(k+4,k+6,k+5)])
mesh=bpy.data.meshes.new('Momo | realtime individual fibres');mesh.from_pydata(pv.reshape(-1,3).tolist(),[],faces);mesh.update()
proxy=bpy.data.objects.new('Momo_SkinnedFur',mesh);scene.collection.objects.link(proxy);proxy.parent=root
for poly in mesh.polygons:poly.use_smooth=True
mesh.normals_split_custom_set_from_vertices(np.repeat(N,7,axis=0).tolist())
colour=mesh.color_attributes.new(name='Coat',type='FLOAT_COLOR',domain='POINT');cc=np.repeat(colours[:GAME_COUNT,None,:],7,axis=1);cc*=np.array([.86,.86,.96,.96,1,1,1])[None,:,None];rgba=np.concatenate([cc,np.ones((GAME_COUNT,7,1))],axis=2);colour.data.foreach_set('color',rgba.astype(np.float32).ravel())
# A single soft edge texture antialiases a fibre, without any clump image pattern.
fw,fh=32,128;u,v=np.meshgrid(np.linspace(0,1,fw),np.linspace(0,1,fh));alpha=np.clip((.5-np.abs(u-.5))/.20,0,1)*np.clip((1-v)/.12,0,1)
rgba=np.ones((fh,fw,4),dtype=np.float32);rgba[:,:,3]=alpha
img=bpy.data.images.new('Momo | single soft fibre edge',width=fw,height=fh,alpha=True);img.pixels.foreach_set(rgba.ravel());img.filepath_raw=str(ROOT/'assets/momo/fibre-edge.png');img.file_format='PNG';img.save();img.pack()
uv=mesh.uv_layers.new(name='FibreUV');coords=[(0,0),(1,0),(0,2/7),(1,2/7),(0,5/7),(1,5/7),(.5,1)]
for poly in mesh.polygons:
 for li in poly.loop_indices:uv.data[li].uv=coords[mesh.loops[li].vertex_index%7]
mat=bpy.data.materials.new('Momo | tapered guard hairs soft individual fibres');mat.use_nodes=True;mat.surface_render_method='BLENDED';mat.use_backface_culling=False
nt=mat.node_tree;bs=nt.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=.72
attr=nt.nodes.new('ShaderNodeVertexColor');attr.layer_name='Coat';nt.links.new(attr.outputs['Color'],bs.inputs['Base Color']);tex=nt.nodes.new('ShaderNodeTexImage');tex.image=img;nt.links.new(tex.outputs['Alpha'],bs.inputs['Alpha']);mesh.materials.append(mat)
# Barycentric interpolation of existing authored weights preserves deformation.
bones=[b.name for b in arm.data.bones];bi={n:i for i,n in enumerate(bones)};vw=np.zeros((len(verts),len(bones)))
for vert in skin.data.vertices:
 for group in vert.groups:
  name=skin.vertex_groups[group.group].name
  if name in bi:vw[vert.index,bi[name]]=group.weight
weights=np.einsum('ni,nij->nj',w[:GAME_COUNT],vw[tv[:GAME_COUNT]])
groups=[proxy.vertex_groups.new(name=n) for n in bones]
for i,row in enumerate(weights):
 inds=np.argsort(row)[-4:];total=row[inds].sum()
 for b in inds:
  val=row[b]/total
  if val>1e-5:groups[b].add(list(range(i*7,(i+1)*7)),float(val),'REPLACE')
mod=proxy.modifiers.new('Momo native skeletal deformation','ARMATURE');mod.object=arm
proxy['groom_source']='Momo_SoftHair';proxy['strand_count']=GAME_COUNT
# Export only the game proxy and ordinary rig, retaining native curves in source.
bpy.ops.object.select_all(action='DESELECT')
for ob in [root]+list(root.children_recursive):
 if ob.type=='CURVES':continue
 ob.hide_viewport=False;ob.hide_render=False;ob.hide_set(False);ob.select_set(True)
# Attachment tiles belong to the native groom only. Exporting them splits every
# skin triangle into separate vertices without providing any game-visible data.
attachment_uv=np.empty(len(attach.data)*2,dtype=np.float32);attach.data.foreach_get('uv',attachment_uv)
skin.data.uv_layers.remove(attach)
try:
 bpy.ops.export_scene.gltf(filepath=str(OUT/'momo-raw.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_yup=True,export_apply=False,export_extras=True,export_image_format='JPEG',export_jpeg_quality=85,export_skins=True,export_animations=False)
finally:
 attach=skin.data.uv_layers.new(name='GroomUV');attach.data.foreach_set('uv',attachment_uv)
proxy.hide_render=True;proxy.hide_set(True)
for ob in root.children_recursive:
 if str(ob.get('visibilitySlot','')).startswith('closedEye'):ob.hide_render=True;ob.hide_set(True)
scene.render.engine='CYCLES';scene.cycles.samples=64;scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.015
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='OPTIX';prefs.refresh_devices()
for d in prefs.devices:d.use=d.type=='OPTIX'
scene.cycles.device='GPU';scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.render.filepath=str(OUT/'cycles-final.png')
# Save the actual Cycles groom for inspection in Blender.
bpy.ops.object.select_all(action='DESELECT');native_grooms[0].select_set(True);bpy.context.view_layer.objects.active=native_grooms[0]
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D':
  area.spaces.active.shading.type='RENDERED';area.spaces.active.region_3d.view_perspective='CAMERA'
# CPU default keeps the saved scene portable; batch preview uses the detected GPU.
scene.cycles.device='CPU'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/momo/momo.blend'),compress=True)
scene.cycles.device='GPU'
# High-precision quantization plus lossless Meshopt packing; never simplify hairs.
import subprocess
subprocess.run(['node',str(ROOT/'scripts/optimize-momo.mjs'),str(OUT/'momo-raw.glb'),str(ROOT/'public/models/momo.glb')],cwd=str(ROOT),check=True)
report={'native_curves':COUNT,'game_strands':GAME_COUNT,'game_fur_vertices':len(mesh.vertices),'game_fur_triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'glb_bytes':(ROOT/'public/models/momo.glb').stat().st_size,'native_radius_range':[float(radius.min()),float(radius.max())],'clumping':0,'cycles_roughness':.40}
(OUT/'groom-report.json').write_text(json.dumps(report,indent=2));print(report,flush=True)
bpy.ops.render.render(write_still=True)
