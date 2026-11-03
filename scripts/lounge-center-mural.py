"""Center the entire mural assembly on the exposed portion of its rear wall.

Called by the room builder, or on the editable source for an incremental export.
World-space artwork bounds make the operation safe to repeat.
"""
bpy.context.view_layer.update()
mural_group=scene.objects['05 | reference cat mural and foliage']
mural_art=scene.objects['Wide eyed cat wall artwork']
mural_left=next(box['maxX'] for box in layout['obstacles'] if box['id']=='cubbies')
mural_right=layout['blockedFloor']['minX']
mural_target=(mural_left+mural_right)/2
mural_points=[mural_art.matrix_world @ vertex.co for vertex in mural_art.data.vertices]
mural_current=(min(point.x for point in mural_points)+max(point.x for point in mural_points))/2
mural_group.location.x+=mural_target-mural_current
bpy.context.view_layer.update()
mural_points=[mural_art.matrix_world @ vertex.co for vertex in mural_art.data.vertices]
assert min(point.x for point in mural_points)>mural_left
assert max(point.x for point in mural_points)<mural_right
mural_group['visibleWallMinX']=mural_left
mural_group['visibleWallMaxX']=mural_right
mural_group['artworkCenterX']=mural_target
scene['muralCenterRevision']='Poster, frame, ledge and greenery centered on exposed rear wall'
print('MURAL_CENTERED',mural_current,'->',mural_target,'visible wall',mural_left,mural_right,flush=True)
