"""Render the explainer: stills for review, or the full frame sequence piped to ffmpeg.
usage: python3 render.py stills t1 t2 ...   |   python3 render.py video [fps]"""
import json, sys, subprocess, pathlib, base64
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
TL = json.loads((HERE / 'timeline.json').read_text())
ISL = (HERE / 'island.json').read_text()

def open_page(p):
    b = p.chromium.launch(args=['--allow-file-access-from-files', '--disable-web-security', '--use-gl=swiftshader'])
    pg = b.new_page(viewport={'width': 1920, 'height': 1080})
    pg.on('console', lambda m: print('[console]', m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: print('[pageerror]', e))
    pg.goto((HERE / 'explainer.html').as_uri())
    pg.evaluate('document.fonts.ready')
    pg.evaluate("""async () => { await Promise.all([
      document.fonts.load('800 100px "Archivo"'), document.fonts.load('700 40px "Archivo"'),
      document.fonts.load('400 20px "Public Sans"'), document.fonts.load('500 20px "Public Sans"'), document.fonts.load('600 20px "Public Sans"'),
      document.fonts.load('400 20px "JetBrains Mono"'), document.fonts.load('500 20px "JetBrains Mono"')]); }""")
    pg.evaluate(f'initExplainer({ISL}, {json.dumps(TL)})')
    return b, pg

def grab(pg, t):
    data = pg.evaluate(f"(() => {{ drawFrame({t}); return document.getElementById('c').toDataURL('image/png').split(',')[1]; }})()")
    return base64.b64decode(data)

if __name__ == '__main__':
    mode = sys.argv[1]
    with sync_playwright() as p:
        b, pg = open_page(p)
        if mode == 'stills':
            out = HERE / 'stills'; out.mkdir(exist_ok=True)
            for t in sys.argv[2:]:
                (out / f't{float(t):07.2f}.png').write_bytes(grab(pg, float(t)))
                print('still', t)
        else:
            fps = int(sys.argv[2]) if len(sys.argv) > 2 else 30
            n = int(TL['duration'] * fps)
            ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(fps), '-i', '-',
                                   '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(HERE / 'video_noaudio.mp4')],
                                  stdin=subprocess.PIPE)
            for i in range(n):
                ff.stdin.write(grab(pg, i / fps))
                if i % 150 == 0: print('frame', i, '/', n, flush=True)
            ff.stdin.close(); ff.wait()
        b.close()
