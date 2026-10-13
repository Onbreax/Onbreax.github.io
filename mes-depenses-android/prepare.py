from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(root.parent / "mes-depenses/build-web.py")], check=True)
destination = root / "app/src/main/assets/index.html"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_bytes((root.parent / "mes-depenses.html").read_bytes())
print("Shared HTML packaged; no bank credentials or personal data copied.")
