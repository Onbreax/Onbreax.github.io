"""Package the shared HTML without personal data or a dependency on GitHub Pages."""
from pathlib import Path
import re, base64, urllib.request, hashlib
root=Path(__file__).resolve().parent
html=(root.parent/'matchwork.html').read_text()
assets=root/'app/src/main/assets'
assets.mkdir(parents=True,exist_ok=True)
icon=re.search(r'<link rel="icon"[^>]+base64,([^" ]+)',html).group(1)
(root/'app/src/main/res/drawable/icon.png').write_bytes(base64.b64decode(icon))
html=re.sub(r'<link href="https://fonts.googleapis.com/[^>]+>','',html)
hashes={'pdf.min.js': '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946', 'pdf.worker.min.js': 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b'}
for name in hashes:
 url='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'+name
 dest=assets/name
 if not dest.exists(): urllib.request.urlretrieve(url,dest)
 if hashlib.sha256(dest.read_bytes()).hexdigest()!=hashes[name]: raise ValueError('PDF dependency checksum mismatch: '+name)
 html=html.replace(url,name)
html=html.replace('function download(name,txt,type){','function download(name,txt,type){if(window.MatchworkNative){MatchworkNative.postMessage(JSON.stringify({action:"save",name,type,text:txt}));return;}')
html=html.replace(' const w=window.open("","_blank");',' if(window.MatchworkNative){MatchworkNative.postMessage(JSON.stringify({action:"print",html}));return;} const w=window.open("","_blank");')
(assets/'index.html').write_text(html)
print('Packaged shared HTML, icon and PDF reader; no personal files copied.')
