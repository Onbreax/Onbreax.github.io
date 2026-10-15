#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to Android SDK 35}"
: "${AUTO_KEYSTORE:?Set AUTO_KEYSTORE to the existing private keystore}"
: "${AUTO_PASSWORD_FILE:?Set AUTO_PASSWORD_FILE to its private password file}"
AUTO_TOOLS="$ANDROID_HOME/build-tools/35.0.0"
AUTO_ANDROID_JAR="$ANDROID_HOME/platforms/android-35/android.jar"
python3 prepare.py
mkdir -p build/classes build/dex
python3 - <<'PY'
from pathlib import Path
import re
import xml.etree.ElementTree as ET
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
source=Path('app/build.gradle').read_text()
root=ET.parse('app/src/main/AndroidManifest.xml').getroot()
root.set('package','fr.onbreax.premiereauto')
root.set('{http://schemas.android.com/apk/res/android}versionCode',re.search(r'versionCode\s+(\d+)',source)[1])
version=re.search(r"versionName\s+'([^']+)'",source)[1]
root.set('{http://schemas.android.com/apk/res/android}versionName',version)
for old_sdk in root.findall('uses-sdk'):
 root.remove(old_sdk)
sdk=ET.Element('uses-sdk')
sdk.set('{http://schemas.android.com/apk/res/android}minSdkVersion',re.search(r'minSdk\s+(\d+)',source)[1])
sdk.set('{http://schemas.android.com/apk/res/android}targetSdkVersion',re.search(r'targetSdk\s+(\d+)',source)[1])
# Android derives application compatibility flags while reading this section.
# Declare the SDK first, so the application is never parsed with legacy defaults.
root.insert(0,sdk)
ET.ElementTree(root).write('build/AndroidManifest.xml',encoding='utf-8')
Path('build/version.txt').write_text(version)
PY
"$AUTO_TOOLS/aapt2" compile --dir app/src/main/res -o build/resources.zip
"$AUTO_TOOLS/aapt2" link -o build/base.apk --manifest build/AndroidManifest.xml -I "$AUTO_ANDROID_JAR" -A app/src/main/assets build/resources.zip
python3 check-package.py build/base.apk --aapt "$AUTO_TOOLS/aapt"
if command -v javac >/dev/null; then
 javac -source 8 -target 8 -classpath "$AUTO_ANDROID_JAR" -d build/classes app/src/main/java/fr/onbreax/premiereauto/*.java
else
 : "${AUTO_ECJ_JAR:?Set AUTO_ECJ_JAR to a standalone Eclipse compiler when javac is unavailable}"
 java -jar "$AUTO_ECJ_JAR" -8 -proc:none -nowarn -classpath "$AUTO_ANDROID_JAR" -d build/classes app/src/main/java/fr/onbreax/premiereauto/*.java
fi
python3 - <<'PY'
from pathlib import Path
import zipfile
with zipfile.ZipFile('build/classes.jar','w',zipfile.ZIP_DEFLATED) as archive:
 for path in Path('build/classes').rglob('*.class'):
  archive.write(path,path.relative_to('build/classes'))
PY
"$AUTO_TOOLS/d8" --lib "$AUTO_ANDROID_JAR" --min-api 26 --output build/dex build/classes.jar
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/base.apk') as source,zipfile.ZipFile('build/unsigned.apk','w',zipfile.ZIP_DEFLATED) as output:
 for entry in source.infolist():
  output.writestr(entry,source.read(entry.filename))
 output.write('build/dex/classes.dex','classes.dex')
PY
"$AUTO_TOOLS/zipalign" -P 16 -f 4 build/unsigned.apk build/aligned.apk
AUTO_VERSION=$(cat build/version.txt)
"$AUTO_TOOLS/apksigner" sign --ks "$AUTO_KEYSTORE" --ks-key-alias matchwork --ks-pass "file:$AUTO_PASSWORD_FILE" --min-sdk-version 26 --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false --out "build/Premiere-Auto-$AUTO_VERSION.apk" build/aligned.apk
"$AUTO_TOOLS/apksigner" verify --verbose "build/Premiere-Auto-$AUTO_VERSION.apk"
