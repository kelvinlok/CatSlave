"""Read-only Blender-native skin/pose audit; run with the saved .blend loaded."""
import bpy,json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
label=arm.name.removesuffix('_Armature');skin=bpy.data.objects[label+'_ContinuousSkin']
assert arm.type=='ARMATURE' and len(arm.data.bones)==28
assert skin.get('surfaceComponents')==1 and skin.get('nonManifoldEdges')==0
assert any(m.type=='ARMATURE' and m.object==arm for m in skin.modifiers)
unweighted=0;max_influences=0;max_sum_error=0
for vert in skin.data.vertices:
    weights=[g.weight for g in vert.groups if g.weight>0]
    unweighted+=not bool(weights);max_influences=max(max_influences,len(weights))
    max_sum_error=max(max_sum_error,abs(sum(weights)-1))
assert unweighted==0 and max_influences<=4 and max_sum_error<1e-5
# The chest midline must stay attached to the torso when either foreleg lifts.
midline=[v for v in skin.data.vertices if abs(v.co.x)<.04 and .30<v.co.z<.50 and -.50<v.co.y<-.15]
for vert in midline:
    leg_weight=sum(g.weight for g in vert.groups if skin.vertex_groups[g.group].name.startswith(('DEF_leg','DEF_lowerLeg','DEF_paw')))
    assert leg_weight<.01, 'Chest midline is assigned to a leg'
depsgraph=bpy.context.evaluated_depsgraph_get()
def sampled():
    bpy.context.view_layer.update()
    evaluated=skin.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
    points=[mesh.vertices[i].co.copy() for i in range(0,len(mesh.vertices),17)]
    evaluated.to_mesh_clear();return points
before=sampled();bone=arm.pose.bones['DEF_head'];original=bone.matrix_basis.copy()
bone.rotation_mode='XYZ';bone.rotation_euler.x=.30
after=sampled();bone.matrix_basis=original;bpy.context.view_layer.update()
moved=sum((a-b).length>.002 for a,b in zip(after,before))
assert moved>50, 'Blender armature did not deform the saved mesh'
tail_checked=0;tail_hair_points_checked=0
if label=='Momo':
    # Regression: the front of the fluffy tail used to be bound to DEF_body,
    # leaving a stationary sheet behind when the tail rotated.
    upper_tail=[v.index for v in skin.data.vertices if v.co.z>1.15 and v.co.y>.48]
    assert len(upper_tail)>100, 'Missing upper tail audit region'
    for index in upper_tail:
        weight=sum(g.weight for g in skin.data.vertices[index].groups if skin.vertex_groups[g.group].name.startswith('DEF_tail'))
        assert weight>.999, f'Upper tail vertex {index} is partly attached to the torso: {weight}'
    def tail_points():
        bpy.context.view_layer.update()
        evaluated=skin.evaluated_get(depsgraph);mesh=evaluated.to_mesh()
        points=[mesh.vertices[i].co.copy() for i in upper_tail]
        evaluated.to_mesh_clear();return points
    before_tail=tail_points();tail_bone=arm.pose.bones['DEF_tail']
    import numpy as np
    hairs=[o for o in bpy.context.scene.objects if o.type=='CURVES' and o.name.startswith('Momo_SoftHair')]
    def groom_points(ob):
        data=ob.evaluated_get(depsgraph).data.attributes['position'].data
        values=np.empty(len(data)*3,dtype=np.float32);data.foreach_get('vector',values)
        return values.reshape(-1,3)
    groom_before={ob.name:groom_points(ob) for ob in hairs}
    original_tail=tail_bone.matrix_basis.copy();original_mode=tail_bone.rotation_mode
    try:
        tail_bone.rotation_mode='XYZ';tail_bone.rotation_euler.x=.40
        after_tail=tail_points()
        assert all((a-b).length>.04 for a,b in zip(after_tail,before_tail)), 'Upper tail remains pinned during tail rotation'
        for hair in hairs:
            points=groom_before[hair.name];mask=(points[:,2]>1.2)&(points[:,1]>.48)
            if mask.any():
                movement=np.linalg.norm(groom_points(hair)[mask]-points[mask],axis=1)
                assert np.isfinite(movement).all() and np.min(movement)>.04, 'Native tail hairs have invalid surface attachments'
                tail_hair_points_checked+=int(mask.sum())
        if hairs:assert tail_hair_points_checked>1000
    finally:
        tail_bone.matrix_basis=original_tail;tail_bone.rotation_mode=original_mode;bpy.context.view_layer.update()
    tail_checked=len(upper_tail)
report={'native_bones':len(arm.data.bones),'skin_vertices':len(skin.data.vertices),'unweighted_vertices':unweighted,'max_influences':max_influences,'max_weight_sum_error':max_sum_error,'chest_midline_vertices_checked':len(midline),'vertices_moved_by_blender_pose_sample':moved,'sample_count':len(before),'source_saved':False}
report['upper_tail_vertices_checked']=tail_checked
report['upper_tail_hair_points_checked']=tail_hair_points_checked
(root/f'artifacts/{label.lower()}-rig/source-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
