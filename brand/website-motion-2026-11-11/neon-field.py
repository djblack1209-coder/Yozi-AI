"""Original periodic color field after the non-landscape Neon Flux composition."""
import argparse
import math
from pathlib import Path
import subprocess
import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=Path, help='Directory for the exported MP4 and WebP')
OUTPUT = parser.parse_args().output.resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT, FRAMES = 1280, 720, 144
destination = OUTPUT / 'yozi-neon-field.mp4'
if destination.exists():
    raise SystemExit(f'Output already exists: {destination}')
y, x = np.mgrid[0:HEIGHT, 0:WIDTH].astype(np.float32)
x, y = x / WIDTH, y / HEIGHT
dither = np.random.default_rng(20261111).uniform(-0.4, 0.4, (HEIGHT, WIDTH, 1)).astype(np.float32)
command = ['ffmpeg', '-nostdin', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{WIDTH}x{HEIGHT}', '-r', '24', '-i', '-', '-an', '-c:v', 'libx264',
           '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(destination)]
with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
    for frame in range(FRAMES):
        phase = frame * math.tau / FRAMES
        rgb = np.full((HEIGHT, WIDTH, 3), (248, 249, 248), dtype=np.float32)
        fields = [
            (0.08 + 0.06 * math.sin(phase), 1.04 + 0.08 * math.cos(phase), 0.22, 0.23, (247, 218, 123)),
            (0.49 + 0.10 * math.sin(phase + 1.4), 1.00 + 0.08 * math.sin(phase), 0.24, 0.24, (178, 164, 238)),
            (0.85 + 0.06 * math.sin(phase + 3.1), 0.96 + 0.07 * math.cos(phase + 0.8), 0.20, 0.22, (92, 198, 235)),
        ]
        for cx, cy, sx, sy, color in fields:
            alpha = (0.94 * np.exp(-0.5 * (((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2)))[..., None]
            rgb = rgb * (1 - alpha) + np.asarray(color, dtype=np.float32) * alpha
        image = np.clip(rgb + dither, 0, 255).astype(np.uint8)
        if frame == 0:
            Image.fromarray(image).save(OUTPUT / 'yozi-neon-field.webp', 'WEBP', quality=88, method=6)
        encoder.stdin.write(image.tobytes())
    encoder.stdin.close()
    code = encoder.wait()
    if code:
        raise SystemExit(f'Encoder failed: {code}')
print(f'{destination.name}: {destination.stat().st_size} bytes; {FRAMES} frames, 24 fps')
