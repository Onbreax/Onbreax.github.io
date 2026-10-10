from pathlib import Path
import json
root=Path(__file__).resolve().parent
raw=json.loads((root/'data/openfootball-snapshot.json').read_text())
bundle={'version':1,'fetchedAt':raw['fetchedAt'],'sha':raw['sha'],'datasets':raw['datasets']}
html=(root/'src/shell.html').read_text()
for marker,name in [('STYLE','style.css'),('MODEL','model.js'),('EXPERIMENT','experiment.js'),('ADAPTER','data.js'),('INSIGHTS','insights.js'),('ANALYST','analyst.js'),('MARKETS','markets.js'),('CHOICES','choices.js'),('ODDS','odds.js'),('ODDSANALYSIS','odds-analysis.js'),('WORKSPACE','workspace.js'),('APP','app.js')]:
    html=html.replace('/*'+marker+'*/',(root/'src'/name).read_text())
html=html.replace('/*DATA*/',json.dumps(bundle,separators=(',',':'),ensure_ascii=False).replace('</','<\\/'))
(root.parent/'football-lab.html').write_text(html)
(root/'android/assets').mkdir(parents=True,exist_ok=True)
(root/'android/assets/index.html').write_text(html)
print('Built HTML and Android assets:',len(html),'characters')
