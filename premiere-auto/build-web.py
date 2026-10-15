from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
web=root/'premiere-auto/web'
template=(web/'template.html').read_text()
for marker,name in [('STYLE','style.css'),('CORE','core.js'),('UI','ui.js')]:
 source=(web/name).read_text().replace('</script','<\\/script')
 template=template.replace('/* '+marker+' */',source)
feed=json.loads((root/'premiere-auto-data.json').read_text())
template=template.replace('/* FEED */',json.dumps(feed,ensure_ascii=False).replace('</','<\\/'))
(root/'premiere-auto.html').write_text(template)
print('Standalone HTML prepared with its dated source inventory.')
