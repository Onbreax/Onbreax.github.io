from pathlib import Path
import subprocess
root=Path(__file__).resolve().parent.parent
subprocess.run(['python3',str(root/'premiere-auto/build-web.py')],check=True)
target=Path(__file__).resolve().parent/'app/src/main/assets/index.html'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_bytes((root/'premiere-auto.html').read_bytes())
print('Shared HTML packaged without user preferences or personal files.')
