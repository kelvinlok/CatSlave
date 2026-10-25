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
report={'native_bones':len(arm.data.bones),'skin_vertices':len(skin.data.vertices),'unweighted_vertices':unweighted,'max_influences':max_influences,'max_weight_sum_error':max_sum_error,'vertices_moved_by_blender_pose_sample':moved,'sample_count':len(before),'source_saved':False}
(root/f'artifacts/{label.lower()}-rig/source-audit.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
