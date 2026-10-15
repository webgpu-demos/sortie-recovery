"""Lay out scenes and caption timings from the voiceover line durations -> timeline.json"""
import json
V = json.load(open('vo/index.json'))
lead = {'open':1.6,'problem':0.7,'idea':0.6,'capture':0.6,'process':0.6,'train':0.6,'detect':0.7,'locate':0.6,'review':0.6,'deliver':0.6,'close':0.8}
tail = {'open':0.8,'problem':0.9,'idea':1.2,'capture':1.1,'process':1.0,'train':1.2,'detect':1.6,'locate':1.4,'review':1.0,'deliver':1.2,'close':4.5}
gap = 0.5; order = []
for v in V:
    if v['scene'] not in order: order.append(v['scene'])
scenes, lines, t = [], [], 0.0
for sid in order:
    st = t; t += lead[sid]
    for v in [x for x in V if x['scene'] == sid]:
        lines.append({'scene': sid, 'start': round(t, 3), 'end': round(t + v['dur'], 3), 'text': v['text'], 'file': v['file']}); t += v['dur'] + gap
    t += tail[sid] - gap
    scenes.append({'id': sid, 'start': round(st, 3), 'end': round(t, 3)})
json.dump({'duration': round(t, 3), 'scenes': scenes, 'lines': lines}, open('timeline.json', 'w'), indent=1)
print('duration', round(t, 1))
