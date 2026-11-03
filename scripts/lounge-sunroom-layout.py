"""Sunroom sofas back onto a full-height glass divider and face the window.

Run after the room's final orientation and furnishing details. The open passage
is at the left end of the glass, as viewed from the main room toward the window.
"""
from mathutils import Matrix

# Original recliner meshes face local -Z; this maps their fronts to game +X.
seats=scene.objects['11 | pair of window recliners']
seats.matrix_world=Matrix.Translation((11.7,-.8,0)) @ Matrix.Rotation(-pi/2,4,'Z')
seats['arrangement']='Backs against separating glass; both seats face +X toward the window'

# Keep the cream loveseat and its soft blanket on the main-room side of glass.
loveseat=scene.objects['09 | cream loveseat by sunroom opening']
loveseat.matrix_world=Matrix.Translation((.75,-2.4,0)) @ Matrix.Rotation(pi/2,4,'Z')

# Keep the cabinet step in the open aisle, away from the forward footstools.
bpy.context.view_layer.update()
for ob in scene.objects['10 | sunroom window drawer cabinets'].children:
    if ob.name.startswith(('Window access step','Access step cushion')):
        transform=ob.matrix_world.copy();transform.translation.y=-1.6;ob.matrix_world=transform

existing=scene.objects.get('17 | clear sunroom dividing glass')
if existing:
    for ob in list(existing.children):bpy.data.objects.remove(ob,do_unlink=True)
    bpy.data.objects.remove(existing,do_unlink=True)
group=section('17 | clear sunroom dividing glass')
clear=mat('Sunroom | clear separating glass','f5fcfc',.045)
bs=clear.node_tree.nodes['Principled BSDF']
bs.inputs['Transmission Weight'].default_value=1
bs.inputs['IOR'].default_value=1.45
bs.inputs['Coat Weight'].default_value=.15
frame=mat('Sunroom | slim aluminum glazing channel','b6bebc',.3,.7)

# Two large clear panes, with a fine central joint rather than a grid screen.
for i,(lo,hi) in enumerate([(.58,3.325),(3.331,6.08)]):
    pane=cube('Sunroom divider | clear glass pane '+str(i+1),
              (5.05,2.05,(lo+hi)/2),(.018,4.03,hi-lo),clear,.002)
    pane['construction']='Transparent full-height divider between main lounge and sunroom'
for y in [.035,4.075]:
    cube('Sunroom divider | horizontal glazing channel',(5.05,y,3.325),(.055,.045,5.55),frame,.004)
for z in [.55,6.10]:
    cube('Sunroom divider | narrow end jamb',(5.05,2.05,z),(.06,4.1,.045),frame,.004)
scene['sunroomRevision']='Two sofas facing the window, backs against clear dividing wall; left-side passage'
bpy.context.view_layer.update()
