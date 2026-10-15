"""Score, sound design and mix for the Sortie explainer. Writes mix.wav (48 kHz stereo)."""
import json, numpy as np, soundfile as sf
from scipy.signal import fftconvolve, resample_poly, butter, sosfilt

SR = 48000
TL = json.load(open('timeline.json'))
DUR = TL['duration'] + 0.5
N = int(DUR * SR)
SC = {s['id']: s for s in TL['scenes']}
def lineT(scene, i):
    ls = [l for l in TL['lines'] if l['scene'] == scene]
    return ls[i]['start'] if i < len(ls) else SC[scene]['start']
rng = np.random.default_rng(7)

def note(n):  # MIDI -> Hz
    return 440.0 * 2 ** ((n - 69) / 12)
def env_adsr(n, a, r, sus=1.0):
    e = np.ones(n) * sus
    ai, ri = int(a * SR), int(r * SR)
    if ai: e[:ai] = np.linspace(0, sus, ai)
    if ri: e[-ri:] *= np.linspace(1, 0, ri)
    return e
def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)
def add(buf, x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i + len(x) <= 0: return
    j0 = max(0, -i); x = x[j0:]; i = max(0, i)
    n = min(len(x), N - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[i:i + n, 0] += x[:n] * gain * l * 1.414
    buf[i:i + n, 1] += x[:n] * gain * r * 1.414

# ---------------- music ----------------
music = np.zeros((N, 2))
def pad_voice(freq, dur, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for h, a in [(1, 1), (2, .45 * bright), (3, .22 * bright), (4, .12 * bright), (5, .06 * bright)]:
        for det in (-0.12, 0.12):
            s += a * np.sin(2 * np.pi * freq * h * (1 + det / 1200 * 8) * t + rng.uniform(0, 6.28))
    s *= 0.5 + 0.08 * np.sin(2 * np.pi * 0.23 * t)
    return lp(s, 1400 * bright) * env_adsr(n, 1.4, 1.8)
def chord(notes, t0, dur, gain, bright=1.0):
    for k, m in enumerate(notes):
        add(music, pad_voice(note(m), dur + 1.5, bright), t0, gain / len(notes), pan=(k - (len(notes) - 1) / 2) * 0.35)

Dm, Bb, Gm, A = [50, 53, 57, 62], [46, 50, 53, 58], [43, 50, 55, 58], [45, 49, 52, 57]
Fm, C, Dmi, Bb2 = [41, 48, 53, 57], [43, 48, 52, 55], [38, 50, 53, 57], [46, 50, 53, 58]
# intro: open + problem
intro_end = SC['idea']['start']
seq = [Dm, Bb, Gm, A]; step = intro_end / 4
for k, ch in enumerate(seq): chord(ch, k * step, step, 0.30)
# body: F C Dm Bb, 5 s each, through deliver
body0, body1 = intro_end, SC['close']['start']
t = body0; k = 0; prog = [Fm, C, Dmi, Bb2]
while t < body1 - 0.5:
    d = min(5.0, body1 - t)
    bright = 1.25 if SC['detect']['start'] <= t < SC['detect']['end'] else 1.0
    chord(prog[k % 4], t, d, 0.30, bright); t += 5.0; k += 1
# close cadence Bb - C - F (ring)
c0 = SC['close']['start']
chord([46, 50, 53, 58], c0, 2.6, 0.32); chord([48, 52, 55, 60], c0 + 2.6, 2.6, 0.32); chord([41, 48, 53, 57, 60, 65], c0 + 5.2, DUR - c0 - 5.2 - 0.3, 0.36, 1.1)

# arpeggio pulse (capture -> end of deliver)
def pluck(freq, dur=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t) + 0.1 * np.sin(6 * np.pi * freq * t)) * np.exp(-t * 7.5)
    s[:120] *= np.linspace(0, 1, 120)
    return s
beat = 60 / 96 / 2
a0, a1 = SC['capture']['start'], SC['close']['start'] - 0.3
t = a0; i = 0
while t < a1:
    ch = prog[int((t - body0) // 5.0) % 4]
    tones = [m + 12 for m in ch[1:]] + [m + 24 for m in ch[1:]]
    m = tones[[0, 1, 2, 3, 2, 1, 4, 3][i % 8] % len(tones)]
    ramp = min(1, (t - a0) / 4.0)
    accent = 1.0 if i % 4 == 0 else 0.7
    add(music, pluck(note(m)), t, 0.075 * ramp * accent, pan=0.35 * np.sin(i * 0.9))
    t += beat; i += 1
# low pulse under the problem scene
p0, p1 = SC['problem']['start'] + 0.4, SC['idea']['start'] - 0.5
t = p0
while t < p1:
    n = int(0.6 * SR); tt = np.arange(n) / SR
    add(music, np.sin(2 * np.pi * (52 + 20 * np.exp(-tt * 12)) * tt) * np.exp(-tt * 6), t, 0.22)
    t += 1.25

# ---------------- sound design ----------------
sfx = np.zeros((N, 2))
def blip(f=880, d=0.16, g=1.0):
    n = int(d * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * (1 - 0.06 * t / d) * t) * np.exp(-t * 28) * g
def tick(g=1.0):
    n = int(0.03 * SR); x = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 260)
    return bp(x, 2500, 7000) * g
def stamp():
    n = int(0.45 * SR); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * (110 * np.exp(-t * 7) + 45) * t) * np.exp(-t * 9)
    click = bp(rng.standard_normal(n), 800, 4000) * np.exp(-t * 60) * 0.5
    return body + click
def whoosh(d=0.8, lo=300, hi=3000):
    n = int(d * SR); t = np.arange(n) / SR; x = rng.standard_normal(n)
    out = np.zeros(n); seg = 2048
    for s0 in range(0, n, seg):
        u = s0 / n; f = lo * (hi / lo) ** u
        out[s0:s0 + seg] = bp(x[s0:s0 + seg], max(80, f * 0.6), min(18000, f * 1.6), 1)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    return out * e
def chime(f=659.25, d=2.8):
    n = int(d * SR); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dc) for r, a, dc in [(1, 1, 1.6), (2.0, .4, 2.4), (2.76, .25, 3.2), (5.4, .1, 5)])
    s[:200] *= np.linspace(0, 1, 200)
    return s

# scene transitions
for s in TL['scenes'][1:]:
    add(sfx, whoosh(0.9, 250, 2200), s['start'] - 0.65, 0.10, pan=-0.2)
o = SC['open']['start']
add(sfx, stamp(), o + 1.65, 0.35)                                   # headline lands
for k in range(len('28 SEPT 2022  ·  HURRICANE IAN  ·  FORT MYERS BEACH, FLORIDA')):  # meta type-on
    if k % 3 == 0: add(sfx, tick(), o + 0.4 + 2.0 * k / 60, 0.05, pan=-0.5)
pr = SC['problem']['start']
for k in range(9):
    tt = pr + 2.2 + (k + 1) * 1.35
    if tt < SC['idea']['start'] - 0.6: add(sfx, blip(1320, 0.12), tt, 0.10, pan=0.3)
t1 = lineT('problem', 1)
for i in range(3): add(sfx, stamp(), t1 + 0.15 + i * 0.75, 0.42)
idS = SC['idea']['start']
for i in range(6): add(sfx, blip(660 * 2 ** (i / 12 * 2), 0.18), idS + 0.6 + 2.8 * 0.09375 * i, 0.14, pan=-0.6 + i * 0.24)
cp = SC['capture']['start']
add(sfx, whoosh(4.5, 400, 1600), cp + 0.6, 0.05)
tB = lineT('capture', 1) - 0.2
for k in range(16): add(sfx, tick(), tB + 0.28 * k + 0.3, 0.07, pan=np.sin(k))
ps = SC['process']['start']
add(sfx, whoosh(3.0, 200, 2600), ps + 0.4, 0.10)
for i in range(3): add(sfx, blip(1046, 0.14), ps + 1.8 + i * 0.6 + 0.3, 0.12, pan=0.5)
add(sfx, whoosh(2.5, 120, 900), ps + 5.0, 0.12)
ts = SC['train']['start']; t2 = lineT('train', 2); t3 = lineT('train', 3)
for k in range(len('"missing roof covering"')): add(sfx, tick(), t2 + 0.3 + 1.3 * k / 23, 0.06, pan=-0.3)
for k in range(8): add(sfx, blip(880 * 2 ** ((k % 4) / 12 * 3), 0.14), t2 + 1.8 + k * 0.12 + 0.25, 0.09, pan=-0.5 + k * 0.12)
for i in range(3): add(sfx, blip(1175, 0.14), t2 + 3.4 + i * 0.7 + 0.6, 0.11, pan=0.6)
add(sfx, blip(220, 0.25), t3 + 1.0, 0.18)
add(sfx, whoosh(1.0, 300, 2400), t3 + 3.5, 0.10)
ds = SC['detect']['start']; d1 = lineT('detect', 1)
add(sfx, whoosh(4.4, 150, 1200), ds + 0.3, 0.09)
add(sfx, chime(880, 1.6), d1 + 5.6, 0.10)
add(sfx, stamp(), d1 + 5.6, 0.18)
ls = SC['locate']['start']
add(sfx, blip(523, 0.3), ls + 1.4, 0.14)
for i in range(5): add(sfx, blip(1568, 0.1), ls + 1.6 + i * 0.35 + 0.8, 0.07, pan=-0.6 + i * 0.3)
add(sfx, chime(1046, 1.2), ls + 3.7, 0.08)
for tt in (4.4, 5.4, 6.2): add(sfx, tick(), ls + tt, 0.10)
rs = SC['review']['start']; r1 = lineT('review', 1)
for tt in (2.4, 3.4, 4.6): add(sfx, stamp(), rs + tt, 0.40)
add(sfx, whoosh(1.8, 400, 3500), r1 - 0.2, 0.08)
dl = SC['deliver']['start']; dl1 = lineT('deliver', 1)
for i in range(4): add(sfx, tick(), dl + 1.2 + i * 0.6, 0.12)
add(sfx, chime(784, 1.4), dl + 4.4, 0.09)
for i in range(4): add(sfx, blip(988, 0.12), dl1 + 0.9 + i * 0.35, 0.08, pan=0.4)
add(sfx, whoosh(0.8, 500, 3000), dl1 + 2.8, 0.09)
cs = SC['close']
add(sfx, chime(698.46, 4.0), cs['end'] - 3.0, 0.16)
add(sfx, chime(1046.5, 4.0), cs['end'] - 3.0, 0.07)

# ---------------- reverb ----------------
def ir(dur=2.4, seed=3):
    r = np.random.default_rng(seed); n = int(dur * SR); t = np.arange(n) / SR
    out = np.stack([lp(r.standard_normal(n), 5000) * np.exp(-t * 2.6) for _ in range(2)], 1)
    return out / np.sqrt((out ** 2).sum(0))
IR = ir()
def verb(x, wet):
    y = np.stack([fftconvolve(x[:, c], IR[:, c])[:N] for c in range(2)], 1)
    return x + wet * y
music = verb(music, 0.55)
sfx = verb(sfx, 0.25)

# ---------------- voice ----------------
vo = np.zeros((N, 2)); act = np.zeros(N)
for l in TL['lines']:
    a, sr = sf.read(l['file'])
    a = resample_poly(a, SR, sr) if sr != SR else a
    a = a / (np.sqrt(np.mean(a ** 2)) + 1e-9) * 0.085
    i = int(l['start'] * SR); n = min(len(a), N - i)
    vo[i:i + n, 0] += a[:n]; vo[i:i + n, 1] += a[:n]; act[i:i + n] = 1
# gentle presence lift + high-pass for the voice
vo = np.stack([sosfilt(butter(2, 90, 'high', fs=SR, output='sos'), vo[:, c]) for c in range(2)], 1)

# ducking envelope (attack 0.15 s, release 0.6 s)
k = int(0.05 * SR); sm = np.convolve(act, np.ones(k) / k, 'same')
duck = np.empty(N); g = 1.0
att, rel = np.exp(-1 / (0.15 * SR)), np.exp(-1 / (0.6 * SR))
target = 1 - 0.55 * (sm > 0.01)
for i in range(N):
    tg = target[i]; c = att if tg < g else rel; g = tg + (g - tg) * c; duck[i] = g
mix = vo + music * duck[:, None] * 0.32 + sfx * 1.1
# fade out tail
fo = int(1.2 * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
peak = np.abs(mix).max(); mix = mix / peak * 0.89
sf.write('mix.wav', mix.astype(np.float32), SR)
def db(x): return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print('peak before norm', round(float(peak), 3), 'dur', round(N / SR, 2))
print('rms voice-only %.1f dB, music %.1f dB, sfx %.1f dB' % (db(vo[act > 0]), db(music), db(sfx)))
mb = music * duck[:, None] * 0.32
print('during speech: voice %.1f dB vs music %.1f dB' % (db(vo[act > 0]), db(mb[act > 0])))
print('in gaps: music %.1f dB' % db(mb[act == 0]))
