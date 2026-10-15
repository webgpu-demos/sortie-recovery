# Sortie explainer video

A 2½-minute, 1080p explainer for an executive audience. It walks through the whole flight-to-field workflow: capture, processing and storage, labeling and training, detection, review, the Damage Description and Dimensions (DDD), and client delivery.

Everything is generated from code:

- **Picture:** `engine.js` draws every frame on a canvas from a single time value (`drawFrame(t)`), so any frame can be reproduced exactly.
- **Voice:** Kokoro text-to-speech (`af_heart`), from `script.json`.
- **Music and effects:** synthesized in `audio.py`, timed to the same timeline as the picture.

## Build

```bash
pip install kokoro-onnx soundfile playwright scipy
# Kokoro model files: github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0); set the path in tts.py
python3 tts.py                      # voiceover lines -> vo/
python3 build_timeline.py           # scene and caption timings -> timeline.json
python3 render.py stills 12.5 40    # review individual frames
python3 render.py video 30          # frames -> video_noaudio.mp4
python3 audio.py                    # score + sound design + mix -> mix.wav
ffmpeg -i video_noaudio.mp4 -i mix.wav -af "alimiter=limit=0.89,loudnorm=I=-16:TP=-1.5:LRA=11" \
       -c:v copy -c:a aac -b:a 192k -shortest sortie-explainer.mp4
```

`island.json` is exported from the app's real CRASAR-U-DROIDs data (Fort Myers Beach, Hurricane Ian).

## Scenes

| # | Scene | Visual idea | Data |
|---|---|---|---|
| 1 | Open | Storm passes over the real island; headline | Real footprints |
| 2 | Problem | One inspector walks house to house; "4 / 931" | Real footprints |
| 3 | Idea | Six-stage pipeline lights up | — |
| 4 | Capture | Drone sweep reveals the island; detail orbit of a facility | Real footprints |
| 5 | Process | Photo tiles assemble into an orthomosaic, then extrude into a 3D model; secure-storage checks | Real footprints |
| 6 | Train | CRASAR dataset; Roboflow Auto Label prompt; AI agent runs the job; expert removes a false positive; two models train | Dataset size real; tiles illustrative |
| 7 | Detect | Scan line colors buildings by damage; blocked roads; route to a facility | **Real labels and routing** |
| 8 | Locate | Camera rays converge on a roof defect; measurement and location certainty | Illustrative |
| 9 | Review | Confirm, reject, send to field; corrections loop back to training | Illustrative |
| 10 | Deliver | DDD line items assemble, then the client package | Illustrative |
| 11 | Close | "The pieces exist today. Connecting them is the opportunity." | — |

## Credits

- Building and road damage labels: CRASAR-U-DROIDs, Center for Robot-Assisted Search and Rescue, Texas A&M (CC BY 4.0).
- Fonts: Archivo, Public Sans, JetBrains Mono (SIL OFL), via Fontsource.
- Voice: Kokoro-82M (Apache 2.0).
