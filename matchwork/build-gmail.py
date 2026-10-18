"""Embed the maintained Gmail modules into the standalone HTML."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent
path=root.parent/'matchwork.html';html=path.read_text()
for name in ('core','integration'):
    start='/* MATCHWORK_GMAIL_'+name.upper()+'_BEGIN */'
    end='/* MATCHWORK_GMAIL_'+name.upper()+'_END */'
    value=start+'\n'+(root/f'gmail-{name}.js').read_text()+'\n'+end
    html,count=re.subn(re.escape(start)+r'[\s\S]*?'+re.escape(end),lambda _:value,html)
    if count!=1:raise ValueError('Missing or duplicate Gmail module marker: '+name)
path.write_text(html)
print('Shared Gmail modules embedded in matchwork.html.')
