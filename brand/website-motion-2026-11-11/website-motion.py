"""Original Yozi motion studies, using the owner's three selected compositions.

Reference artwork and prompts are not embedded. Run with Blender 5.2 in background.
Outputs are deterministic, silent loops. Preserve the approved Pudding Hero separately.
"""

import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = None
FPS = 24
FRAMES = 144


def material(name, color, metallic=0.0, roughness=0.3, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Transmission Weight'].default_value = transmission
    shader.inputs['Coat Weight'].default_value = 0.38
    shader.inputs['Coat Roughness'].default_value = 0.18
    return mat


def object_material(obj, mat):
    obj.data.materials.append(mat)
    return obj


def box(name, position, size, mat, bevel=0.1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
    modifier.width = bevel
    modifier.segments = 5
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return object_material(obj, mat)


def orb(name, position, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=position)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return object_material(obj, mat)


def cylinder(name, position, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=80, radius=radius, depth=depth, location=position)
    obj = bpy.context.object
    obj.name = name
    mod = obj.modifiers.new('Rounded rim', 'BEVEL')
    mod.width = 0.07
    mod.segments = 4
    obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return object_material(obj, mat)


def curve(name, points, radius, mat):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 20
    data.bevel_depth = radius
    data.bevel_resolution = 4
    spline = data.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, xyz in zip(spline.points, points):
        point.co = (*xyz, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return object_material(obj, mat)


def face(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def light(position, energy, size, color):
    bpy.ops.object.light_add(type='AREA', location=position)
    obj = bpy.context.object
    obj.data.energy, obj.data.shape, obj.data.size = energy, 'DISK', size
    obj.data.color = color
    face(obj, (0, 0, 1.1))


def setup(name, camera=(6, -9, 6), target=(0, 0, 1.1), ortho=7.6):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = name
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.use_persistent_data = True
    scene.cycles.max_bounces = 5
    scene.cycles.transmission_bounces = 4
    preferences = bpy.context.preferences.addons['cycles'].preferences
    try:
        preferences.compute_device_type = 'METAL'
        preferences.get_devices()
        for device in preferences.devices:
            device.use = device.type == 'METAL'
        if any(device.type == 'METAL' for device in preferences.devices):
            scene.cycles.device = 'GPU'
    except (TypeError, RuntimeError):
        pass
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 1, FRAMES
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.world = bpy.data.worlds.new('Soft studio world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.78, 0.83, 0.92, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.5
    scene.view_settings.view_transform = 'AgX'
    light((-3, -4, 7), 850, 5, (1, 0.96, 0.9))
    light((4, 1, 5), 1000, 4, (0.65, 0.78, 1))
    light((-4, 4, 3), 600, 3, (0.76, 0.89, 1))
    bpy.ops.object.camera_add(location=camera)
    scene.camera = bpy.context.object
    scene.camera.data.type = 'ORTHO'
    scene.camera.data.ortho_scale = ortho
    face(scene.camera, target)
    mats = {
        'paper': material('Warm porcelain', (0.85, 0.87, 0.9), roughness=0.25),
        'blue': material('Yozi cobalt', (0.015, 0.085, 0.8), metallic=0.15, roughness=0.23),
        'ink': material('Ink', (0.012, 0.025, 0.075), roughness=0.24),
        'glass': material('Pale blue optical glass', (0.39, 0.68, 0.96), roughness=0.12, transmission=0.65),
        'silver': material('Brushed pearl', (0.63, 0.72, 0.9), metallic=0.8, roughness=0.23),
    }
    box('Infinite studio floor', (0, 0, -0.18), (200, 200, 0.25), mats['paper'], 0)
    return scene, mats


def loop_keys(obj, fn):
    for frame in range(1, FRAMES + 2):
        phase = (frame - 1) * math.tau / FRAMES
        location, rotation = fn(phase)
        obj.location = location
        obj.rotation_euler = rotation
        obj.keyframe_insert('location', frame=frame)
        obj.keyframe_insert('rotation_euler', frame=frame)


def glass_route():
    scene, mats = setup('Yozi glass route', (6, -8, 5.6), (0, 0, 1.25), 7.6)
    iridescent = material('Iridescent learning bead', (0.52, 0.62, 0.96), metallic=0.65, roughness=0.16)
    nodes = iridescent.node_tree.nodes
    layer = nodes.new('ShaderNodeLayerWeight')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.03, 0.1, 0.9, 1)
    ramp.color_ramp.elements[1].color = (0.65, 0.93, 1, 1)
    ramp.color_ramp.elements.new(0.42).color = (0.55, 0.15, 0.95, 1)
    ramp.color_ramp.elements.new(0.7).color = (0.15, 0.9, 0.85, 1)
    iridescent.node_tree.links.new(layer.outputs['Facing'], ramp.inputs[0])
    iridescent.node_tree.links.new(ramp.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])
    cylinder('Return pedestal', (1.45, 0.45, 0.48), 0.73, 1.1, mats['paper'])
    cylinder('Cobalt foot', (1.45, 0.45, 0.08), 0.77, 0.17, mats['blue'])
    cylinder('Optical tower', (1.45, 0.45, 1.92), 0.49, 1.8, mats['glass'])
    orb('Tower cap', (1.45, 0.45, 2.82), (0.49, 0.49, 0.36), mats['glass'])
    for height in (1.05, 1.15, 2.7):
        cylinder('Pearl collar', (1.45, 0.45, height), 0.53, 0.07, mats['silver'])
    route = lambda t: (-1.0 + 1.8 * math.cos(t), -0.25 + 0.75 * math.sin(t), 0.55 + 0.32 * math.cos(t))
    for offset in (-0.22, 0.22):
        points = []
        for i in range(129):
            t = i * math.tau / 128
            x, y, z = route(t)
            points.append((x, y + offset, z))
        curve('Continuous porcelain rail', points, 0.105, mats['paper'])
        curve('Fine blue rail inlay', [(x, y, z + 0.09) for x, y, z in points], 0.018, mats['blue'])
    for i, phase in enumerate((0, math.tau / 3, math.tau * 2 / 3)):
        bead = orb(f'Learning bead {i}', (0, 0, 1), (0.27, 0.27, 0.27), iridescent)
        loop_keys(bead, lambda t, p=phase: ((*(route(t + p)[:2]), route(t + p)[2] + 0.23), (t + p, t * 0.5, 0)))
    core = orb('Recirculating tower core', (1.45, 0.45, 1.9), (0.32, 0.32, 0.39), iridescent)
    loop_keys(core, lambda t: ((1.45, 0.45, 1.9 + 0.38 * math.sin(t)), (0, 0, t)))
    return scene


def study_console():
    scene, mats = setup('Yozi study console', (5.8, -9, 5), (0, 0, 1.55), 7.2)
    body = box('Cobalt monitor housing', (0, 0, 2), (2.7, 1.25, 2.0), mats['blue'], 0.25)
    bezel = box('Soft porcelain bezel', (0, -0.65, 2.04), (2.45, 0.18, 1.76), mats['paper'], 0.18)
    screen = box('Deep blue display', (0, -0.76, 2.1), (2.13, 0.1, 1.4), mats['ink'], 0.16)
    stand = cylinder('Floating monitor stand', (0, 0.04, 0.89), 0.47, 0.35, mats['silver'])
    cylinder('Stand foot', (0, 0.04, 0.66), 0.7, 0.12, mats['paper'])
    for index, width in enumerate((1.35, 0.98, 1.18)):
        bar = box('Saved feedback line', (-0.12, -0.83, 2.42 - index * 0.27), (width, 0.025, 0.075), mats['glass'], 0.035)
        bar.parent = screen
        bar.matrix_parent_inverse = screen.matrix_world.inverted()
    keyboard = box('Floating keyboard chassis', (0, -1.25, 0.46), (2.9, 1.25, 0.23), mats['paper'], 0.12)
    keyboard.rotation_euler.x = math.radians(9)
    for row in range(3):
        for col in range(9):
            position = (-1.15 + col * 0.285, -1.62 + row * 0.31, 0.73 + 0.1 * row)
            key = box(f'Key {row}-{col}', position, (0.245, 0.25, 0.14), mats['blue'] if (row, col) in ((1, 4), (2, 7)) else mats['paper'], 0.035)
            phase = col * 0.42 + row * 0.6
            loop_keys(key, lambda t, pos=position, p=phase: ((pos[0], pos[1], pos[2] + 0.07 * math.sin(t + p)), (0.15, 0, 0)))
    enter = box('Raised cobalt return key', (1.72, -0.65, 1.24), (0.58, 0.72, 0.3), mats['blue'], 0.1)
    loop_keys(enter, lambda t: ((1.72, -0.65, 1.24 + 0.15 * math.sin(t)), (0.18, 0.12 * math.sin(t), -0.25)))
    for i in range(3):
        bead = orb(f'Glass thought {i}', (-1.8, 0, 1.2), (0.17, 0.17, 0.17), mats['glass'])
        loop_keys(bead, lambda t, n=i: ((-1.8 - 0.15 * math.sin(t + n), 0.2 + n * 0.15, 1.25 + n * 0.48 + 0.1 * math.sin(t + n)), (0, 0, t)))
    for obj in (body, bezel, screen, stand):
        pos = tuple(obj.location)
        loop_keys(obj, lambda t, p=pos: ((p[0], p[1], p[2] + 0.055 * math.sin(t)), (0, 0, 0)))
    return scene


def main():
    global ROOT
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('scene', choices=['glass-route', 'study-console'])
    parser.add_argument('--animate', action='store_true')
    parser.add_argument('--output', required=True, type=Path, help='Ignored render-output directory')
    options = parser.parse_args(args)
    ROOT = options.output.resolve()
    ROOT.mkdir(parents=True, exist_ok=True)
    scene = glass_route() if options.scene == 'glass-route' else study_console()
    destination = ROOT / options.scene
    destination.mkdir(exist_ok=True)
    scene.frame_set(1)
    scene.render.filepath = str(destination / 'frame-')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / f'{options.scene}.blend'))
    print('YOZI_RENDER', scene.name, scene.cycles.device, flush=True)
    if options.animate:
        bpy.ops.render.render(animation=True)
    else:
        scene.render.filepath = str(ROOT / f'{options.scene}-preview.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
