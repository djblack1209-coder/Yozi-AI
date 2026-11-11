"""Encode the two observed MotionSites Copy URL sources for the Yozi website.

Usage: python3 prepare-web-media.py SOURCE_DIRECTORY WEBSITE_MEDIA_DIRECTORY
The original downloads stay outside the public website and are not modified.
"""
import argparse
from io import BytesIO
from pathlib import Path
import shutil
import subprocess
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_directory', type=Path)
    parser.add_argument('output_directory', type=Path)
    args = parser.parse_args()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        parser.error('ffmpeg is required')
    sources = [
        ('motion-background-18', 'yozi-glass-route', 1280, 720),
        ('ember-trail', 'yozi-study-console', 960, 960),
    ]
    for source, target, width, height in sources:
        original = args.source_directory / f'source-{source}.mp4'
        if not original.is_file():
            parser.error(f'Missing original: {original}')
        args.output_directory.mkdir(parents=True, exist_ok=True)
        movie = args.output_directory / f'{target}.mp4'
        # Blend the last half-second into the first. The next loop starts at
        # that same source position, avoiding a hard camera/object-position cut.
        graph = (
            f'[0:v]fps=24,scale={width}:{height}:flags=lanczos,setsar=1,'
            'format=yuv420p,split=2[main][head];'
            '[main]trim=start=0.5:end=10,setpts=PTS-STARTPTS[body];'
            '[head]trim=start=0:end=0.5,setpts=PTS-STARTPTS[intro];'
            '[body][intro]xfade=transition=fade:duration=0.5:offset=9,'
            'format=yuv420p[loop]'
        )
        subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(original),
            '-filter_complex', graph, '-map', '[loop]', '-an', '-r', '24',
            '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
            '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
            '-movflags', '+faststart', str(movie),
        ], check=True)
        poster = subprocess.run([
            ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(movie),
            '-frames:v', '1', '-c:v', 'png', '-f', 'image2pipe', 'pipe:1',
        ], check=True, capture_output=True)
        with Image.open(BytesIO(poster.stdout)) as image:
            image.save(args.output_directory / f'{target}.webp', 'WEBP', quality=82)
        print(f'{target}: {movie.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    main()
