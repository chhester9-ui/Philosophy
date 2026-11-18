"""Records lesson narration with the free Kokoro text-to-speech model.

Reads the paragraph lists written by scripts/narration-text.mjs and writes, for each lesson,
app/audio/<id>.mp3 plus app/audio/<id>.json (the start time of every paragraph, used by the
app to highlight along and skip). Lessons that already have audio are skipped, so it can be
stopped and restarted at any time.

Setup:  pip install kokoro-onnx soundfile   (and ffmpeg on PATH)
Model:  kokoro-v1.0.onnx and voices-v1.0.bin from
        https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Usage:  python3 scripts/record_audio.py --model-dir DIR [--voice bm_lewis] [--minutes 100] [ids...]
"""
import argparse, json, os, re, subprocess, sys, tempfile, time
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Pauses (seconds) after each kind of segment, for natural pacing.
PAUSE_AFTER = {'title': 0.9, 'subtitle': 1.4, 'heading': 0.7, 'para': 0.55, 'item': 0.35, 'quote': 0.8}
PAUSE_BEFORE = {'heading': 0.6}

FIXES = [
    (r'\bc\.\s*(?=\d)', 'circa '),
    (r'\b(\d+)\s*[–-]\s*(\d+)\s*(BCE|CE)\b', r'\1 to \2 \3'),
    (r'\bBCE\b', 'B.C.E.'), (r'(?<=\d )CE\b', 'C.E.'),
    (r'\be\.g\.', 'for example'), (r'\bi\.e\.', 'that is'), (r'\betc\.', 'et cetera'),
    (r'\bvs\.?', 'versus'), (r'\bcf\.', 'compare'),
    (r'(\d)\s*[–-]\s*(\d)', r'\1 to \2'),
    (r'[“”]', '"'), (r'[‘’]', "'"), (r'—', ', '), (r'…', '...'),
]

def prepare(text):
    for pat, rep in FIXES:
        text = re.sub(pat, rep, text)
    return re.sub(r'\s+', ' ', text).strip()

def record(k, voice, lang, speed, segs, mp3_path, json_path):
    sr = 24000
    parts, starts, t = [], [], 0.0
    for seg in segs:
        before = PAUSE_BEFORE.get(seg['type'], 0) if starts else 0
        if before:
            parts.append(np.zeros(int(sr * before), dtype=np.float32)); t += before
        starts.append(round(t, 2))
        audio, sr = k.create(prepare(seg['text']), voice=voice, speed=speed, lang=lang)
        audio = audio.astype(np.float32)
        parts.append(audio); t += len(audio) / sr
        gap = PAUSE_AFTER.get(seg['type'], 0.5)
        parts.append(np.zeros(int(sr * gap), dtype=np.float32)); t += gap
    full = np.concatenate(parts)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        sf.write(tmp.name, full, sr)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-ac', '1', '-ar', '24000',
                        '-b:a', '32k', '-id3v2_version', '3', mp3_path], check=True)
        os.unlink(tmp.name)
    with open(json_path, 'w') as f:
        json.dump({'voice': voice, 'duration': round(len(full) / sr, 2), 'segments': starts}, f)
    return len(full) / sr

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model-dir', required=True)
    ap.add_argument('--text-dir', default=os.path.join(ROOT, 'build', 'narration'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'app', 'audio'))
    ap.add_argument('--voice', default='bm_lewis')
    ap.add_argument('--speed', type=float, default=0.95)
    ap.add_argument('--minutes', type=float, default=0, help='stop starting new lessons after this long (0 = no limit)')
    ap.add_argument('ids', nargs='*')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    k = Kokoro(os.path.join(a.model_dir, 'kokoro-v1.0.onnx'), os.path.join(a.model_dir, 'voices-v1.0.bin'))
    lang = 'en-gb' if a.voice.startswith('b') else 'en-us'
    ids = a.ids or sorted(f[:-5] for f in os.listdir(a.text_dir) if f.endswith('.json'))
    ids.sort(key=lambda i: (not i.startswith('day-'), i))
    t0 = time.time()
    for id_ in ids:
        mp3, js = os.path.join(a.out, f'{id_}.mp3'), os.path.join(a.out, f'{id_}.json')
        if os.path.exists(js) and os.path.exists(mp3):
            continue
        if a.minutes and time.time() - t0 > a.minutes * 60:
            print('time limit reached', flush=True); break
        segs = json.load(open(os.path.join(a.text_dir, f'{id_}.json')))
        s = time.time()
        dur = record(k, a.voice, lang, a.speed, segs, mp3, js)
        print(f'{id_}: {dur/60:.1f} min of audio in {(time.time()-s)/60:.1f} min', flush=True)
    done = len([f for f in os.listdir(a.out) if f.endswith('.json')])
    print(f'DONE {done}/{len(ids)} lessons recorded', flush=True)

if __name__ == '__main__':
    main()
