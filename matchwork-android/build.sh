#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to Android SDK 35}"
: "${MATCHWORK_KEYSTORE:?Set MATCHWORK_KEYSTORE to the existing private keystore}"
: "${MATCHWORK_PASSWORD_FILE:?Set MATCHWORK_PASSWORD_FILE to its private password file}"
MATCHWORK_TOOLS="$ANDROID_HOME/build-tools/35.0.0"
MATCHWORK_ANDROID_JAR="$ANDROID_HOME/platforms/android-35/android.jar"
python3 prepare.py
mkdir -p build/classes build/dex
python3 - <<'PY'
from pathlib import Path
import re
import xml.etree.ElementTree as ET
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
source=Path('app/build.gradle').read_text()
root=ET.parse('app/src/main/AndroidManifest.xml').getroot()
root.set('package','fr.onbreax.matchwork')
root.set('{http://schemas.android.com/apk/res/android}versionCode',re.search(r'versionCode\s+(\d+)',source)[1])
version=re.search(r"versionName\s+'([^']+)'",source)[1]
root.set('{http://schemas.android.com/apk/res/android}versionName',version)
sdk=ET.SubElement(root,'uses-sdk')
sdk.set('{http://schemas.android.com/apk/res/android}minSdkVersion','26')
sdk.set('{http://schemas.android.com/apk/res/android}targetSdkVersion','35')
ET.ElementTree(root).write('build/AndroidManifest.xml',encoding='utf-8')
Path('build/version.txt').write_text(version)
PY
"$MATCHWORK_TOOLS/aapt2" compile --dir app/src/main/res -o build/resources.zip
"$MATCHWORK_TOOLS/aapt2" link -o build/base.apk --manifest build/AndroidManifest.xml -I "$MATCHWORK_ANDROID_JAR" -A app/src/main/assets build/resources.zip
if command -v javac >/dev/null; then
 javac -source 8 -target 8 -classpath "$MATCHWORK_ANDROID_JAR" -d build/classes app/src/main/java/fr/onbreax/matchwork/*.java
else
 : "${MATCHWORK_ECJ_JAR:?Set MATCHWORK_ECJ_JAR to a standalone Eclipse compiler when javac is unavailable}"
 java -jar "$MATCHWORK_ECJ_JAR" -8 -proc:none -nowarn -classpath "$MATCHWORK_ANDROID_JAR" -d build/classes app/src/main/java/fr/onbreax/matchwork/*.java
fi
python3 - <<'PY'
from pathlib import Path
import zipfile
with zipfile.ZipFile('build/classes.jar','w',zipfile.ZIP_DEFLATED) as archive:
 for path in Path('build/classes').rglob('*.class'):
  archive.write(path,path.relative_to('build/classes'))
PY
"$MATCHWORK_TOOLS/d8" --lib "$MATCHWORK_ANDROID_JAR" --min-api 26 --output build/dex build/classes.jar
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/base.apk') as source,zipfile.ZipFile('build/unsigned.apk','w',zipfile.ZIP_DEFLATED) as output:
 for entry in source.infolist():
  output.writestr(entry,source.read(entry.filename))
 output.write('build/dex/classes.dex','classes.dex')
PY
"$MATCHWORK_TOOLS/zipalign" -P 16 -f 4 build/unsigned.apk build/aligned.apk
MATCHWORK_VERSION=$(cat build/version.txt)
"$MATCHWORK_TOOLS/apksigner" sign --ks "$MATCHWORK_KEYSTORE" --ks-key-alias matchwork --ks-pass "file:$MATCHWORK_PASSWORD_FILE" --min-sdk-version 26 --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out "build/Matchwork-$MATCHWORK_VERSION.apk" build/aligned.apk
"$MATCHWORK_TOOLS/apksigner" verify --verbose "build/Matchwork-$MATCHWORK_VERSION.apk"
