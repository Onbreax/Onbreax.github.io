"""Build Android assets from the single shared HTML source. No personal files."""
from pathlib import Path
import base64, re, json, hashlib, urllib.request
root=Path(__file__).resolve().parent
html=(root.parent/'ai-council.html').read_text()
assets=root/'app/src/main/assets';assets.mkdir(parents=True,exist_ok=True)
icon=re.search(r'<link rel="icon"[^>]+base64,([^" ]+)',html).group(1)
(root/'app/src/main/res/drawable').mkdir(parents=True,exist_ok=True)
(root/'app/src/main/res/drawable/icon.png').write_bytes(base64.b64decode(icon))
html=re.sub(r'<link[^>]+https://fonts.googleapis.com[^>]*>','',html)
for item in json.loads((root/'dependencies.json').read_text()):
 dest=assets/item['name']
 if not dest.exists():urllib.request.urlretrieve(item['url'],dest)
 if hashlib.sha256(dest.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Dependency checksum mismatch: '+item['name'])
 html=html.replace(item['url'],item['name'])
def edit(old,new):
 global html
 if html.count(old)!=1:raise ValueError('Shared HTML has changed; review Android adaptation: '+old[:80])
 html=html.replace(old,new)
edit('</style>\n</head>',(root/'android.css').read_text()+'\n</style>\n</head>')
edit('function downloadBackup(data){','function downloadBackup(data){\n if(window.CouncilNative){CouncilNative.postMessage(JSON.stringify({action:"save",name:"ai-council-sauvegarde-"+new Date().toISOString().slice(0,10)+".json",type:"application/json",text:JSON.stringify(data,null,2)}));return;}')
edit('  const w = window.open("", "_blank");','  if(window.CouncilNative){CouncilNative.postMessage(JSON.stringify({action:"print",html}));return;}\n  const w = window.open("", "_blank");')
edit('  const a = document.createElement("a");\n  a.href = URL.createObjectURL(new Blob([out]', '  if(window.CouncilNative){CouncilNative.postMessage(JSON.stringify({action:"save",name:"ai-council-debat-"+now.toISOString().slice(0,10)+".md",type:"text/markdown",text:out}));return;}\n  const a = document.createElement("a");\n  a.href = URL.createObjectURL(new Blob([out]')
edit('function uiRunning(on){','function uiRunning(on){\n if(window.CouncilNative)CouncilNative.postMessage(JSON.stringify({action:"running",value:!!(on||busy())}));')
edit('  btn.addEventListener("click", () => {\n    if (!SR)', '  btn.addEventListener("click", () => {\n    if(window.CouncilNative){CouncilNative.postMessage(JSON.stringify({action:"dictate",target:ta.id,lang:LANG}));return;}\n    if (!SR)')
edit('})();\n</script>',(root/'bridge.js').read_text()+'\n})();\n</script>')
edit('pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())})','pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()),isEvalSupported:false})')
(assets/'index.html').write_text(html)
print('Android assets ready: shared interface, offline file readers, native exports and dictation.')
