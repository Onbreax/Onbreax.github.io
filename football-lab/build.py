from pathlib import Path
import json
root=Path(__file__).resolve().parent
raw=json.loads((root/'data/openfootball-snapshot.json').read_text())
bundle={'version':1,'fetchedAt':raw['fetchedAt'],'sha':raw['sha'],'datasets':raw['datasets']}
html=(root/'src/shell.html').read_text().replace('/*STYLE*/',(root/'src/style.css').read_text()).replace('/*MODEL*/',(root/'src/model.js').read_text()).replace('/*EXPERIMENT*/',(root/'src/experiment.js').read_text()).replace('/*ADAPTER*/',(root/'src/data.js').read_text()).replace('/*INSIGHTS*/',(root/'src/insights.js').read_text()).replace('/*ANALYST*/',(root/'src/analyst.js').read_text()).replace('/*MARKETS*/',(root/'src/markets.js').read_text()).replace('/*CHOICES*/',(root/'src/choices.js').read_text()).replace('/*ODDS*/',(root/'src/odds.js').read_text()).replace('/*WORKSPACE*/',(root/'src/workspace.js').read_text()).replace('/*APP*/',(root/'src/app.js').read_text()).replace('/*DATA*/',json.dumps(bundle,separators=(',',':'),ensure_ascii=False).replace('</','<\\/'))
(root.parent/'football-lab.html').write_text(html)
(root/'android/assets/index.html').write_text(html)
print('Built HTML and Android assets:',len(html),'characters')
