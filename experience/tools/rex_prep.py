#!/usr/bin/env python3
"""FOXREX experience — REX asset preparation (development tool, not shipped to visitors).

Turns approved Higgsfield REX-MASTER media into the web formats the compositing layer (js/rex-layer.js) reads:
  luma    colour footage on pure black (alpha is derived in the shader from brightness)
  alpha   VP9 WebM with a real alpha channel (yuva420p) — needs a matte
  packed  one ordinary video: colour in the top half, greyscale matte in the bottom half — needs a matte
plus a poster frame. A matte can come from Higgsfield background removal (a video/PNG with alpha, or a
greyscale matte video) or from any other masking step; this tool never invents one.

usage: rex_prep.py SHOT_ID COLOUR_VIDEO OUT_DIR [--matte MATTE_VIDEO] [--matte-from-alpha] [--width 1920]
       [--start S] [--dur D] [--loop-xfade S]
Requires ffmpeg (FFMPEG env var or on PATH)."""
import argparse, os, shutil, subprocess, sys

FF = os.environ.get('FFMPEG') or shutil.which('ffmpeg')

def run(args):
    print('ffmpeg', ' '.join(args[1:]) if args[0] == FF else ' '.join(args), flush=True)
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def prep(shot, colour, out, matte=None, matte_from_alpha=False, width=1920, start=0, dur=None, crf_webm=24, crf_mp4=18):
    """Encode one shot; returns {name: path} of the files written."""
    if not FF: raise RuntimeError('ffmpeg not found (set FFMPEG)')
    os.makedirs(out, exist_ok=True)
    o = lambda suffix: os.path.join(out, f'{shot}-{suffix}')
    trim = (['-ss', str(start)] if start else []) + (['-t', str(dur)] if dur else [])
    scale = f'scale={width}:-2:flags=lanczos'
    vp9 = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', str(crf_webm), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an']
    h264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf_mp4), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an']
    done = {}
    # luma (colour over black)
    run([FF, '-y', *trim, '-i', colour, '-vf', f'{scale},format=yuv420p', *vp9, '-pix_fmt', 'yuv420p', o('luma.webm')]); done['luma.webm'] = o('luma.webm')
    run([FF, '-y', *trim, '-i', colour, '-vf', scale, *h264, o('luma.mp4')]); done['luma.mp4'] = o('luma.mp4')
    run([FF, '-y', *trim, '-i', colour, '-vf', scale, '-frames:v', '1', '-q:v', '3', o('poster.jpg')]); done['poster.jpg'] = o('poster.jpg')
    if matte:
        m = '[1:v]alphaextract,format=gray' if matte_from_alpha else '[1:v]format=gray'
        mm = f'{m},{scale}[m];[0:v]{scale},format=yuv420p[c]'
        run([FF, '-y', *trim, '-i', colour, *trim, '-i', matte, '-filter_complex', f'{mm};[m]format=yuv420p[m2];[c][m2]vstack[v]', '-map', '[v]', *vp9, '-pix_fmt', 'yuv420p', o('packed.webm')]); done['packed.webm'] = o('packed.webm')
        run([FF, '-y', *trim, '-i', colour, *trim, '-i', matte, '-filter_complex', f'{mm};[m]format=yuv420p[m2];[c][m2]vstack[v]', '-map', '[v]', *h264, o('packed.mp4')]); done['packed.mp4'] = o('packed.mp4')
        run([FF, '-y', *trim, '-i', colour, *trim, '-i', matte, '-filter_complex', f'{mm};[c][m]alphamerge,format=yuva420p[v]', '-map', '[v]', *vp9, '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', o('alpha.webm')]); done['alpha.webm'] = o('alpha.webm')
        run([FF, '-y', *trim, '-i', colour, *trim, '-i', matte, '-filter_complex', f'{mm};[c][m]alphamerge[v]', '-map', '[v]', '-frames:v', '1', o('alpha-poster.png')]); done['alpha-poster.png'] = o('alpha-poster.png')
    return done

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('shot'); ap.add_argument('colour'); ap.add_argument('out')
    ap.add_argument('--matte', help='matte source: greyscale video, or media with alpha (use --matte-from-alpha)')
    ap.add_argument('--matte-from-alpha', action='store_true', help='take the matte from the alpha channel of --matte')
    ap.add_argument('--width', type=int, default=1920); ap.add_argument('--start', type=float, default=0); ap.add_argument('--dur', type=float)
    ap.add_argument('--crf-webm', type=int, default=24); ap.add_argument('--crf-mp4', type=int, default=18)
    a = ap.parse_args()
    if not FF: sys.exit('ffmpeg not found (set FFMPEG)')
    prep(a.shot, a.colour, a.out, a.matte, a.matte_from_alpha, a.width, a.start, a.dur, a.crf_webm, a.crf_mp4)
    print('done:', a.out)

if __name__ == '__main__':
    main()
