#!/usr/bin/env python3
"""FOXREX experience — LOCAL REX ASSET INGEST (development tool; it never uploads, publishes or commits anything).

Flow:
  1. Put downloaded Higgsfield files in experience/assets/rex/inbox/ (keep the Higgsfield file name, or
     name them R-01_<anything>.png / R-01_<anything>.mp4, or map them in inbox/manifest.json).
  2. Run this tool (Windows: powershell -ExecutionPolicy Bypass -File experience\\ingest-rex.ps1).
     For every file it identifies the shot, validates dimensions / codecs / alpha, computes SHA-256, builds a
     web-ready candidate with poster and preview in processed/<shot>/<variant>/ and a candidate manifest the
     review page composites against the real Market Noise world.
  3. Review at /experience/rex-review/ and APPROVE or REJECT. Decisions are local metadata
     (assets/rex/review-decisions.json).
  4. Run this tool again: the approved variant of each shot is copied to approved/<shot>/ and
     assets/rex/rex-assets.json is rewritten so the experience itself uses it.

inbox/, processed/, approved/, rex-assets.json and review-decisions.json are all gitignored. Raw Higgsfield masters
are never committed by this tool; promoting an approved asset into git is a separate, explicit owner decision.

usage: rex_ingest.py [--dry-run] [--no-media]
  --dry-run   inspect and report only; write nothing
  --no-media  skip ffmpeg encodes (validation, hashes and manifests only)
ffmpeg/ffprobe are optional (FFMPEG / FFPROBE env vars or PATH). Without them, images are still fully handled;
videos are listed but their codecs cannot be verified or transcoded."""
import argparse, datetime, hashlib, json, os, re, shutil, struct, subprocess, sys

for _s in (sys.stdout, sys.stderr):   # Windows consoles: never crash on non-ASCII output
    try: _s.reconfigure(errors='replace')
    except AttributeError: pass
HERE = os.path.dirname(os.path.abspath(__file__))
XP = os.path.dirname(HERE)
REX = os.path.join(XP, 'assets', 'rex')
INBOX, PROCESSED, APPROVED = (os.path.join(REX, d) for d in ('inbox', 'processed', 'approved'))
GENERATIONS = os.path.join(REX, 'higgsfield-generations.json')
DECISIONS = os.path.join(REX, 'review-decisions.json')
MANIFEST = os.path.join(REX, 'rex-assets.json')
IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp'}
VIDEO_EXT = {'.mp4', '.webm', '.mov', '.m4v'}
WEB_VIDEO_CODECS = {'h264', 'vp9', 'av1', 'hevc', 'vp8'}
# the approved visual plan: what each shot is planned to be (R-08 is not required)
PLAN = {'R-01': 'video', 'R-02': 'video', 'R-03': 'video', 'R-04': 'still', 'R-05': 'video', 'R-06': 'still', 'R-07': 'video'}
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.I)
SHOT_IN_NAME = re.compile(r'(?:^|[^a-z0-9])r[-_ ]?0?([1-9])(?![0-9])', re.I)
SAFE = re.compile(r'[^A-Za-z0-9_-]+')

sys.path.insert(0, HERE)
import rex_prep  # noqa: E402  (shares the encoder settings with the manual tool)

FF = rex_prep.FF
FP = os.environ.get('FFPROBE') or shutil.which('ffprobe') or (FF and os.path.join(os.path.dirname(FF), 'ffprobe' + ('.exe' if os.name == 'nt' else '')))
if FP and not os.path.isfile(FP): FP = None


def now(): return datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
def rel(p, start=XP): return os.path.relpath(p, start).replace(os.sep, '/')
def load(path, default):
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except FileNotFoundError: return default
    except json.JSONDecodeError as e: sys.exit(f'{rel(path)} is not valid JSON: {e}')
def save(path, obj, dry):
    if dry: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(obj, f, indent=2, ensure_ascii=False); f.write('\n')
    os.replace(tmp, path)
def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------ probing
def image_header(path):
    """Width, height and alpha from the file header (PNG, JPEG, WebP) without third-party libraries."""
    with open(path, 'rb') as f: head = f.read(64 * 1024)
    if head[:8] == b'\x89PNG\r\n\x1a\n':
        w, h, depth, ctype = struct.unpack('>IIBB', head[16:26])
        return {'format': 'png', 'width': w, 'height': h, 'bit_depth': depth, 'alpha': ctype in (4, 6) or b'tRNS' in head}
    if head[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(head):
            if head[i] != 0xFF: i += 1; continue
            marker = head[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack('>HH', head[i + 5:i + 9]); return {'format': 'jpeg', 'width': w, 'height': h, 'alpha': False}
            i += 2 + struct.unpack('>H', head[i + 2:i + 4])[0]
        return {'format': 'jpeg'}
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        kind = head[12:16]
        if kind == b'VP8X': return {'format': 'webp', 'width': 1 + int.from_bytes(head[24:27], 'little'), 'height': 1 + int.from_bytes(head[27:30], 'little'), 'alpha': bool(head[20] & 0x10)}
        if kind == b'VP8L':
            b = int.from_bytes(head[21:25], 'little'); return {'format': 'webp', 'width': (b & 0x3FFF) + 1, 'height': ((b >> 14) & 0x3FFF) + 1, 'alpha': bool((b >> 28) & 1)}
        if kind == b'VP8 ': return {'format': 'webp', 'width': struct.unpack('<H', head[26:28])[0] & 0x3FFF, 'height': struct.unpack('<H', head[28:30])[0] & 0x3FFF, 'alpha': False}
    return {}

def ffprobe(path):
    if not FP: return None
    try:
        out = subprocess.run([FP, '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path], check=True, capture_output=True, text=True).stdout
        return json.loads(out)
    except (subprocess.CalledProcessError, json.JSONDecodeError): return None

def ffmpeg_info(path):
    """Fallback when ffprobe is absent: parse `ffmpeg -i` (stream summary on stderr)."""
    if not FF: return {}
    err = subprocess.run([FF, '-hide_banner', '-i', path], capture_output=True, text=True).stderr
    m = re.search(r'Stream #\S+.*?Video: (\w+).*?, (\w+)(?:\([^)]*\))?, (\d{2,5})x(\d{2,5})', err)
    if not m: return {}
    info = {'codec': m.group(1), 'pix_fmt': m.group(2), 'width': int(m.group(3)), 'height': int(m.group(4))}
    f = re.search(r'([\d.]+) fps', err); info['fps'] = float(f.group(1)) if f else None
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    info['duration'] = round(int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)), 3) if d else None
    info['alpha'] = info['pix_fmt'].startswith(('yuva', 'rgba', 'bgra', 'argb', 'abgr', 'gbrap', 'ya')) or bool(re.search(r'alpha_mode\s*:\s*1', err))
    info['audio'] = 'Audio:' in err
    info['probed_with'] = 'ffmpeg'
    return info

def probe(path, kind):
    info = image_header(path) if kind == 'image' else {}
    pr = ffprobe(path)
    if not pr and kind == 'video':
        info = ffmpeg_info(path) or info
        info.setdefault('probed_with', 'none')
        return info
    if pr:
        v = next((s for s in pr.get('streams', []) if s.get('codec_type') == 'video'), None)
        if v:
            info.setdefault('width', v.get('width')); info.setdefault('height', v.get('height'))
            info['codec'] = v.get('codec_name'); info['pix_fmt'] = v.get('pix_fmt')
            tags = {k.lower(): str(val) for k, val in (v.get('tags') or {}).items()}
            if kind == 'video':
                fr = v.get('avg_frame_rate') or v.get('r_frame_rate') or '0/1'
                n, d = (fr.split('/') + ['1'])[:2]
                info['fps'] = round(float(n) / float(d), 3) if float(d) else None
                info['duration'] = round(float(v.get('duration') or (pr.get('format') or {}).get('duration') or 0), 3)
                info['frames'] = int(v['nb_frames']) if str(v.get('nb_frames', '')).isdigit() else None
                info['alpha'] = (info['pix_fmt'] or '').startswith(('yuva', 'rgba', 'bgra', 'argb', 'abgr', 'gbrap', 'ya')) or tags.get('alpha_mode') == '1'
                info['audio'] = any(s.get('codec_type') == 'audio' for s in pr.get('streams', []))
            elif info.get('alpha') is None:
                info['alpha'] = (info['pix_fmt'] or '').startswith(('rgba', 'bgra', 'ya', 'yuva', 'gbrap'))
        info['probed_with'] = 'ffprobe'
    else:
        info['probed_with'] = 'header' if info else 'none'
    return info

def border_luma(path, kind):
    """Mean luma of a 6% frame border (8-bit, TV range: black = 16). Luma keying needs a pure black surround."""
    if not FF: return None
    vf = 'crop=iw:ih*0.06:0:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-'
    args = [FF, '-v', 'error'] + (['-ss', '0.5'] if kind == 'video' else []) + ['-i', path, '-frames:v', '1', '-vf', vf, '-f', 'null', '-']
    try:
        out = subprocess.run(args, check=True, capture_output=True, text=True).stdout
        m = re.findall(r'YAVG=([\d.]+)', out)
        return round(float(m[-1]), 1) if m else None
    except subprocess.CalledProcessError: return None


# ------------------------------------------------------------------ identification
def identify(name, gens, inbox_map):
    m = inbox_map.get(name)
    if m and re.fullmatch(r'R-0[1-9]', m.get('shot', '')): return m['shot'], m.get('variant'), None, 'inbox/manifest.json'
    u = UUID.search(name)
    if u:
        g = next((g for g in gens if g['job_id'].lower() == u.group(0).lower()), None)
        if g: return g['shot'], g.get('variant') or g['job_id'][:8], g, 'Higgsfield job id'
    s = SHOT_IN_NAME.search(os.path.splitext(name)[0])
    if s: return f'R-0{s.group(1)}', None, None, 'file name'
    return None, None, None, None


def checks_for(shot, kind, info, size, lum):
    c = []
    add = lambda level, msg: c.append({'level': level, 'msg': msg})
    w, h = info.get('width'), info.get('height')
    if not (w and h): add('error', 'could not read the dimensions')
    else:
        a = w / h
        if abs(a - 16 / 9) / (16 / 9) > 0.03: add('warn', f'aspect {a:.3f} is not 16:9 (the shot plan is 16:9)')
        if w < 1920: add('warn', f'width {w}px is below 1920px — will look soft on large displays')
    planned = PLAN.get(shot)
    if planned == 'video' and kind == 'image': add('info', f'{shot} is planned as VIDEO; this is a still (key frame / start frame for image-to-video). Approving it approves the start frame.')
    if planned == 'still' and kind == 'video': add('warn', f'{shot} is planned as a STILL, but this is a video')
    if kind == 'video':
        if info.get('probed_with') == 'none': add('warn', 'ffmpeg not available: codec, frame rate and alpha are unverified and no web encode was made (install ffmpeg)')
        else:
            if info.get('codec') not in WEB_VIDEO_CODECS: add('warn', f'codec {info.get("codec")} is not web-playable; a web encode is required (ffmpeg)')
            if info.get('duration') is not None and info['duration'] < 3: add('warn', f'duration {info["duration"]}s is short for a held shot')
            if info.get('fps') and info['fps'] < 23.9: add('warn', f'{info["fps"]} fps — motion may look stepped')
            if info.get('audio'): add('info', 'has an audio track (dropped in the web encode)')
    if info.get('alpha'): add('info', 'has an alpha channel — usable as the alpha key; luma key also available')
    else: add('info', 'no alpha channel — keyed by luminance (needs a pure black surround)')
    if lum is not None:
        if lum > 22: add('warn', f'frame border is not black (mean luma {lum} vs 16) — a luma key would show a veil; use alpha/packed')
        else: add('ok', f'frame border is black (mean luma {lum}) — suitable for the luma key')
    if size > 40 * 1024 * 1024: add('warn', f'{size / 1048576:.0f} MB source — the web encode will be much smaller')
    return c


# ------------------------------------------------------------------ build one candidate
def build(item, dry, media):
    shot, vid, src, kind, info = item['shot'], item['variant'], item['path'], item['kind'], item['info']
    out = os.path.join(PROCESSED, shot, vid)
    meta_path = os.path.join(out, 'meta.json')
    old = load(meta_path, {})
    web, poster, preview, variants = {}, None, None, {}
    fresh = old.get('sha256') == item['sha256'] and old.get('built_with_media') == bool(media and FF) and old.get('info') == info and (item.get('matte') or None) == old.get('matte')
    if fresh:
        return old.get('web', {}), old.get('manifest_shot'), 'unchanged'
    if dry: return {}, None, 'would build'
    if os.path.isdir(out): shutil.rmtree(out)
    os.makedirs(out)
    aspect = round(info['width'] / info['height'], 4) if info.get('width') and info.get('height') else 16 / 9
    if kind == 'image':
        ext = os.path.splitext(src)[1].lower().replace('.jpeg', '.jpg')
        shutil.copy2(src, os.path.join(out, 'rex' + ext))     # lossless: the review judges the delivered pixels
        web['image'] = 'rex' + ext
        if media and FF:
            rex_prep.run([FF, '-y', '-i', src, '-vf', 'scale=1920:-2:flags=lanczos', '-frames:v', '1', '-q:v', '2', os.path.join(out, 'poster.jpg')])
            rex_prep.run([FF, '-y', '-i', src, '-vf', 'scale=640:-2:flags=lanczos', '-frames:v', '1', '-q:v', '3', os.path.join(out, 'preview.jpg')])
            web['poster'], web['preview'] = 'poster.jpg', 'preview.jpg'
        else:
            web['poster'] = web['preview'] = web['image']
        shot_def = {'image': web['image'], 'aspect': aspect, 'anchor': [0.5, 0.5], 'mode': 'alpha' if info.get('alpha') else 'luma'}
        if info.get('alpha'): variants = {'luma': {'image': web['image'], 'mode': 'luma'}, 'alpha': {'image': web['image'], 'mode': 'alpha'}}
    else:
        if media and FF:
            matte = item.get('matte')
            done = rex_prep.prep(shot, src, out, matte=matte or (src if info.get('alpha') else None), matte_from_alpha=bool(info.get('alpha') and not matte))
            names = {k: os.path.basename(v) for k, v in done.items()}
            web['video'] = {'webm': names['luma.webm'], 'mp4': names['luma.mp4']}
            web['poster'] = names['poster.jpg']
            rex_prep.run([FF, '-y', '-i', os.path.join(out, names['poster.jpg']), '-vf', 'scale=640:-2', '-q:v', '3', os.path.join(out, 'preview.jpg')])
            web['preview'] = 'preview.jpg'
            if 'alpha.webm' in names: variants['alpha'] = {'video': {'webm': names['alpha.webm']}, 'poster': names['alpha-poster.png'], 'mode': 'alpha'}
            if 'packed.webm' in names: variants['packed'] = {'video': {'webm': names['packed.webm'], 'mp4': names['packed.mp4']}, 'mode': 'packed'}
            variants['luma'] = {'video': dict(web['video']), 'poster': web['poster'], 'mode': 'luma'}
        else:
            ext = os.path.splitext(src)[1].lower()
            shutil.copy2(src, os.path.join(out, 'rex' + ext))
            web['video'] = {'webm' if ext == '.webm' else 'mp4': 'rex' + ext}
        shot_def = {'video': web['video'], 'aspect': aspect, 'anchor': [0.5, 0.5], 'mode': 'luma', 'loop': True}
        if web.get('poster'): shot_def['poster'] = web['poster']
    if variants: shot_def['variants'] = variants
    manifest = {'about': f'CANDIDATE {shot} / {vid} — local review only (generated by tools/rex_ingest.py)', 'candidate': True, 'mode': shot_def['mode'], 'shots': {shot: shot_def}}
    save(os.path.join(out, 'manifest.json'), manifest, dry)
    save(meta_path, {'shot': shot, 'variant': vid, 'source': rel(src), 'sha256': item['sha256'], 'built': now(), 'built_with_media': bool(media and FF), 'web': web, 'manifest_shot': shot_def, 'info': info, 'matte': item.get('matte'), 'higgsfield': item.get('higgsfield')}, dry)
    return web, shot_def, 'built'


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--no-media', action='store_true')
    a = ap.parse_args()
    dry, media = a.dry_run, not a.no_media
    for d in (INBOX, PROCESSED, APPROVED): os.makedirs(d, exist_ok=True)
    reg = load(GENERATIONS, {'generations': []}); gens = reg.get('generations', [])
    inbox_map = load(os.path.join(INBOX, 'manifest.json'), {}).get('files', {})
    decisions = load(DECISIONS, {})
    log = []
    say = lambda s='': (print(s), log.append(s))
    say(f'FOXREX REX ingest · {now()} · ffmpeg: {"yes" if FF else "NO"} · ffprobe: {"yes" if FP else "NO"}{" · DRY RUN" if dry else ""}')
    say(f'inbox: {rel(INBOX)}')

    files = sorted(f for f in os.listdir(INBOX) if not f.startswith('.') and f not in ('README.md', 'manifest.json') and os.path.isfile(os.path.join(INBOX, f)))
    items, mattes, skipped = [], {}, []
    for name in files:
        path = os.path.join(INBOX, name); ext = os.path.splitext(name)[1].lower()
        kind = 'image' if ext in IMAGE_EXT else 'video' if ext in VIDEO_EXT else None
        if not kind: skipped.append((name, 'unsupported file type')); continue
        stem = os.path.splitext(name)[0]
        if re.search(r'[-_.]matte$', stem, re.I):
            mattes[re.sub(r'[-_.]matte$', '', stem, flags=re.I).lower()] = path; continue
        shot, variant, g, how = identify(name, gens, inbox_map)
        if not shot: skipped.append((name, 'shot not identified — name it R-0N_<anything> or add it to inbox/manifest.json')); continue
        if g and g.get('preview_file') == name:
            skipped.append((name, 'Higgsfield low-resolution preview (_min.webp) — download the full PNG instead')); continue
        variant = SAFE.sub('-', variant or stem).strip('-')[:48] or 'v'
        items.append({'name': name, 'path': path, 'stem': stem.lower(), 'kind': kind, 'shot': shot, 'variant': variant, 'how': how, 'higgsfield': g})
    for it in items: it['matte'] = mattes.get(it['stem'])
    seen = {}
    for it in items:   # unique variant ids per shot
        key = (it['shot'], it['variant'])
        if key in seen: seen[key] += 1; it['variant'] = f'{it["variant"]}-{seen[key]}'
        else: seen[key] = 1

    hashes = {}
    index = {'about': 'Local REX candidates (generated by tools/rex_ingest.py; gitignored). The review page reads this.', 'generated': now(), 'ffmpeg': bool(FF), 'ffprobe': bool(FP), 'shots': {}}
    for it in items:
        it['sha256'] = sha256(it['path']); size = os.path.getsize(it['path'])
        it['info'] = probe(it['path'], it['kind'])
        lum = border_luma(it['path'], it['kind']) if media else None
        checks = checks_for(it['shot'], it['kind'], it['info'], size, lum)
        if it['sha256'] in hashes: checks.append({'level': 'warn', 'msg': f'identical to {hashes[it["sha256"]]} (same SHA-256)'})
        hashes.setdefault(it['sha256'], it['name'])
        if it['matte']: checks.append({'level': 'info', 'msg': f'matte supplied: {os.path.basename(it["matte"])}'})
        web, shot_def, state = build(it, dry, media)
        base = f'assets/rex/processed/{it["shot"]}/{it["variant"]}/'
        g = it['higgsfield']
        entry = {
            'id': it['variant'], 'shot': it['shot'], 'kind': it['kind'], 'identified_by': it['how'],
            'source': {'file': it['name'], 'url': 'assets/rex/inbox/' + it['name'], 'bytes': size, 'sha256': it['sha256'], **{k: v for k, v in it['info'].items() if v is not None}},
            'web': {k: (base + v if isinstance(v, str) else {kk: base + vv for kk, vv in v.items()}) for k, v in web.items()},
            'manifest': base + 'manifest.json', 'mode': (shot_def or {}).get('mode'), 'key_modes': sorted((shot_def or {}).get('variants', {}).keys()), 'checks': checks, 'build': state,
            'decision': (decisions.get(it['shot'], {}).get(it['variant']) or {}).get('decision'),
        }
        if g: entry['higgsfield'] = {k: g.get(k) for k in ('job_id', 'model', 'seed', 'resolution', 'created_utc', 'stage', 'prompt_id')}
        if g and g.get('prompt_id'): entry['higgsfield']['prompt'] = reg.get('prompts', {}).get(g['prompt_id'])
        index['shots'].setdefault(it['shot'], {'plan': PLAN.get(it['shot']), 'variants': []})['variants'].append(entry)
        lv = {'error': 'ERROR', 'warn': 'WARN', 'info': 'info', 'ok': 'ok'}
        say(f'\n{it["shot"]} · {it["variant"]} · {it["name"]} ({it["how"]})')
        nf = it['info']; dims = f'{nf["width"]}x{nf["height"]}' if nf.get('width') else 'size ?'
        extra = ''.join(f' · {nf[k]}{u}' for k, u in (('fps', ' fps'), ('duration', ' s')) if nf.get(k))
        say(f'  {it["kind"]} {dims} {nf.get("codec") or nf.get("format") or ""}{extra} · {size / 1048576:.2f} MB · sha256 {it["sha256"]}')
        for c in checks: say(f'  [{lv[c["level"]]}] {c["msg"]}')
        say(f'  candidate: {state} → {base}')
    for name, why in skipped: say(f'\nskipped {name}: {why}')
    for k, p in mattes.items():
        if not any(it['matte'] == p for it in items): say(f'\nunused matte {os.path.basename(p)}: no colour file named {k}.*')
    if not items: say('\nNo REX files in the inbox yet.')

    # approvals → approved/<shot>/ + rex-assets.json
    approved_shots = {}
    for shot, per in decisions.items():
        appr = sorted(((d.get('at', ''), v) for v, d in per.items() if d.get('decision') == 'approve'), reverse=True)
        if not appr: continue
        if len(appr) > 1: say(f'\n{shot}: {len(appr)} variants approved — using the most recent ({appr[0][1]})')
        vid = appr[0][1]; meta = load(os.path.join(PROCESSED, shot, vid, 'meta.json'), None)
        if not meta: say(f'\n{shot}: approved variant {vid} has no processed candidate (run ingest with its file in the inbox)'); continue
        dst = os.path.join(APPROVED, shot)
        if not dry:
            if os.path.isdir(dst): shutil.rmtree(dst)
            shutil.copytree(os.path.join(PROCESSED, shot, vid), dst, ignore=shutil.ignore_patterns('meta.json', 'manifest.json'))
            save(os.path.join(dst, 'approved.json'), {'shot': shot, 'variant': vid, 'approved_at': per[vid].get('at'), 'note': per[vid].get('note', ''), 'source_sha256': meta['sha256'], 'source': meta['source'], 'higgsfield': meta.get('higgsfield')}, dry)
        sd = json.loads(json.dumps(meta['manifest_shot']))
        def prefix(o):
            for k, v in list(o.items()):
                if k in ('image', 'poster') and isinstance(v, str): o[k] = f'approved/{shot}/{v}'
                elif k == 'video': o[k] = {kk: f'approved/{shot}/{vv}' for kk, vv in v.items()}
                elif k == 'variants': [prefix(x) for x in v.values()]
        prefix(sd); sd['approved'] = {'variant': vid, 'sha256': meta['sha256']}
        approved_shots[shot] = sd
        say(f'\n{shot}: APPROVED {vid} → {rel(dst)}')
    rejected = [(s, v) for s, per in decisions.items() for v, d in per.items() if d.get('decision') == 'reject']
    for s, v in rejected: say(f'{s}: rejected {v}')
    if approved_shots:
        save(MANIFEST, {'about': 'Approved REX shots for the experience (generated by tools/rex_ingest.py from local review decisions; gitignored).', 'generated': now(), 'mode': 'luma', 'shots': approved_shots}, dry)
        say(f'\nwrote {rel(MANIFEST)} ({", ".join(sorted(approved_shots))})')
    elif os.path.exists(MANIFEST) and not dry:
        os.remove(MANIFEST); say(f'\nremoved {rel(MANIFEST)} (no approved shots)')
    index['approved'] = {s: d['approved']['variant'] for s, d in approved_shots.items()}
    save(os.path.join(PROCESSED, 'index.json'), index, dry)
    if not dry:
        with open(os.path.join(PROCESSED, 'ingest-report.txt'), 'w', encoding='utf-8') as f: f.write('\n'.join(log) + '\n')
    say('\nNothing was uploaded, published or committed.')

if __name__ == '__main__':
    main()
