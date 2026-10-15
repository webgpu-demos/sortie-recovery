import json,sys,soundfile as sf,numpy as np
from kokoro_onnx import Kokoro
TT='/tmp/claude-0/-home-claude-sortie-recovery/873d54a7-b0f3-59b2-817f-29a84c7c9820/scratchpad/tts/'
k=Kokoro(TT+'kokoro-v1.0.onnx',TT+'voices-v1.0.bin')
S=json.load(open('script.json'));out=[]
import os;os.makedirs('vo',exist_ok=True)
for sc in S:
  for i,l in enumerate(sc['lines']):
    a,sr=k.create(l,voice='af_heart',speed=0.96,lang='en-us')
    # trim silence
    th=0.01;idx=np.where(np.abs(a)>th)[0];a=a[max(0,idx[0]-int(.03*sr)):idx[-1]+int(.08*sr)]
    fn=f"vo/{sc['id']}_{i}.wav";sf.write(fn,a,sr);out.append({'scene':sc['id'],'i':i,'text':l,'file':fn,'dur':round(len(a)/sr,3),'sr':sr})
    print(fn,round(len(a)/sr,2))
json.dump(out,open('vo/index.json','w'),indent=1)
print('total',round(sum(o['dur'] for o in out),1))
