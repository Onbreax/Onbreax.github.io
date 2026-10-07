from pathlib import Path
import re,base64,urllib.request,hashlib,json
root=Path(__file__).resolve().parent;html=(root.parent/'lottery-metrics.html').read_text();assets=root/'app/src/main/assets';assets.mkdir(parents=True,exist_ok=True)
for d in json.loads((root/'dependencies.json').read_text()):
 p=assets/d['name']
 if not p.exists():urllib.request.urlretrieve(d['url'],p)
 if hashlib.sha256(p.read_bytes()).hexdigest()!=d['sha256']:raise ValueError('Invalid dependency '+d['name'])
 html=html.replace(d['url'],d['name'])
html=re.sub(r'<link[^>]+https://fonts.googleapis.com[^>]*>','',html)

icon=re.search(r'<link rel="icon"[^>]+base64,([^" ]+)',html)
if not icon:icon=re.search(r'<img[^>]+base64,([^" ]+)',html)
p=root/'app/src/main/res/drawable';p.mkdir(parents=True,exist_ok=True);(p/'icon.webp').write_bytes(base64.b64decode(icon.group(1)))
(assets/'index.html').write_text(html)
print('Lottery Metrics Android assets ready')
