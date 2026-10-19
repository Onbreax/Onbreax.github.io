"""Create the distributable local HTML/Gmail bundle, without private files."""
from pathlib import Path
import re
import zipfile

root = Path(__file__).resolve().parent
html = (root.parent / "matchwork.html").read_text(encoding="utf-8")
version = re.search(r"Matchwork ([0-9]+\.[0-9]+\.[0-9]+) ·", html)[1]
assert '<meta name="matchwork-gmail-local"' not in html
assert '<meta name="matchwork-native"' not in html
windows = '''@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 gmail-local.py
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.9 ou plus recent est necessaire pour ce lanceur.
  ) else (
    python gmail-local.py
  )
)
pause
'''.replace("\n", "\r\n")
unix = '''#!/bin/sh
cd "$(dirname "$0")" || exit 1
exec python3 gmail-local.py
'''
readme = f'''MATCHWORK {version} — HTML ET GMAIL LOCAL

Prérequis : Python 3.9 ou plus récent. Aucun paquet Python à installer.

1. Décompresse le dossier.
2. Windows : ouvre Lancer-Matchwork.cmd.
   macOS/Linux : dans ce dossier, exécute python3 gmail-local.py.
   Windows en ligne de commande : py -3 gmail-local.py.
3. Le lanceur ouvre http://127.0.0.1:8765/matchwork.html.
   Garde sa fenêtre ouverte. Ctrl+C pour arrêter.
4. Profil et cible > Alertes emploi Gmail : adresse Gmail + mot de passe
   d’application Google à 16 caractères, puis Connecter Gmail.

Pour créer ce code, active d’abord la validation en deux étapes Google,
puis ouvre https://myaccount.google.com/apppasswords et nomme le code Matchwork.
N’utilise jamais ton mot de passe Google habituel. Cette option peut être
indisponible selon le compte et ses réglages de sécurité.

Le code reste en mémoire dans le lanceur, jusqu’à son arrêt. Il est redemandé
à la session suivante. Il ne figure ni dans les fichiers ni dans les sauvegardes.
La connexion IMAP TLS se fait directement de ton ordinateur vers Gmail.
Le lanceur écoute uniquement sur 127.0.0.1 et ne fournit pas de service distant.

Les données web et locales utilisent des stockages navigateur distincts.
Pour reprendre tes données, exporte une sauvegarde Matchwork depuis ta version
web, puis importe-la dans la version locale. Les offres et notes sont conservées
dans la sauvegarde ; les identifiants Gmail ne le sont pas.

Le HTML ouvert seul reste utilisable pour les autres fonctions. Pour Gmail,
utilise l’adresse locale du lanceur. Sur Android, utilise plutôt l’APK 1.1.7.

Gmail : uniquement les alertes jobalerts-noreply@linkedin.com, 200 emails par lot,
2 Mo par email, sans pièces jointes. Aucun email envoyé, supprimé, déplacé ou
marqué comme lu. Le mot de passe d’application donne accès à la messagerie ;
le code Matchwork restreint son usage à cette lecture.

Guide : https://onbreax.github.io/matchwork/gmail-setup.html
Google : https://support.google.com/accounts/answer/185833?hl=fr
Consulté le 19 octobre 2026.

Validation : tests automatiques avec messages fictifs et serveur simulé.
La connexion avec ton compte Gmail n’a pas été testée ici.
'''
files = {"matchwork.html": html.encode("utf-8"), "gmail-local.py": (root / "gmail-local.py").read_bytes(), "Lancer-Matchwork.cmd": windows.encode("ascii"), "Lancer-Matchwork.command": unix.encode("utf-8"), "LIRE-MOI.txt": readme.encode("utf-8")}
target = root / f"Matchwork-HTML-Gmail-local-{version}.zip"
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in files.items():
        info = zipfile.ZipInfo("Matchwork-HTML-Gmail-local/" + name, (2026, 10, 19, 12, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = (0o100755 if name.endswith((".command", ".py")) else 0o100644) << 16
        archive.writestr(info, data)
print(f"Local HTML/Gmail pack created: {target.name} ({target.stat().st_size} bytes).")
