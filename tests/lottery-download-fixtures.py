"""Download public official FDJ test inputs; never user histories."""
from pathlib import Path
import re,urllib.request,zipfile,io,concurrent.futures
root=Path(__file__).resolve().parent.parent/'fdj-samples';root.mkdir(exist_ok=True)
def get(game):
 page=urllib.request.urlopen('https://www.fdj.fr/jeux-de-tirage/'+game+'/historique',timeout=30).read().decode()
 url=re.findall(r'href="(https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/[^"]+)"',page)[0]
 with zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url,timeout=30).read())) as z:
  names=[n for n in z.namelist() if n.endswith('.csv')];assert len(names)==1
  (root/(game+'.csv')).write_bytes(z.read(names[0]))
 print(game,'ready')
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(get,['loto','euromillions-my-million','eurodreams','keno']))
