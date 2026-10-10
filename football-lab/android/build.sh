#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK with platform 35 and build-tools 35.0.0}"
: "${JAVA_HOME:?Set JAVA_HOME to Java 17 (JDK, or runtime with FOOTBALL_ECJ_JAR)}"
: "${FOOTBALL_KEYSTORE:?Set FOOTBALL_KEYSTORE to a private signing keystore}"
: "${FOOTBALL_KEY_PASSWORD_FILE:?Set FOOTBALL_KEY_PASSWORD_FILE to its password file}"
export PATH="$JAVA_HOME/bin:$PATH"
BT="$ANDROID_HOME/build-tools/35.0.0"
JAR="$ANDROID_HOME/platforms/android-35/android.jar"
mkdir -p build/classes build/dex
python3 - <<'PY'
import os, xml.etree.ElementTree as ET
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
tree=ET.parse('AndroidManifest.xml')
if os.environ.get('FOOTBALL_PARALLEL_INSTALL')=='1':
 root=tree.getroot(); root.set('package','fr.onbreax.footballlab.mobile')
 app=root.find('application'); version=root.get('{http://schemas.android.com/apk/res/android}versionName')
 app.set('{http://schemas.android.com/apk/res/android}label','Football Lab '+'.'.join(version.split('.')[:2]))
 app.find('activity').set('{http://schemas.android.com/apk/res/android}name','fr.onbreax.footballlab.MainActivity')
tree.write('build/AndroidManifest.xml',encoding='utf-8')
PY
"$BT/aapt2" compile --dir res -o build/resources.zip
"$BT/aapt2" link -o build/base.apk --manifest build/AndroidManifest.xml -I "$JAR" -A assets build/resources.zip
if [[ -x "$JAVA_HOME/bin/javac" ]]; then
 "$JAVA_HOME/bin/javac" -source 8 -target 8 -classpath "$JAR" -d build/classes src/fr/onbreax/footballlab/MainActivity.java
else
 : "${FOOTBALL_ECJ_JAR:?Set FOOTBALL_ECJ_JAR to the standalone Eclipse Java compiler when javac is unavailable}"
 "$JAVA_HOME/bin/java" -jar "$FOOTBALL_ECJ_JAR" -8 -proc:none -classpath "$JAR" -d build/classes src/fr/onbreax/footballlab/MainActivity.java
fi
python3 - <<'PY'
from pathlib import Path
import zipfile
with zipfile.ZipFile('build/classes.jar','w',zipfile.ZIP_DEFLATED) as z:
 for p in Path('build/classes').rglob('*.class'): z.write(p,p.relative_to('build/classes'))
PY
"$BT/d8" --lib "$JAR" --min-api 26 --output build/dex build/classes.jar
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/base.apk') as src, zipfile.ZipFile('build/unsigned.apk','w',zipfile.ZIP_DEFLATED) as dst:
 for info in src.infolist():dst.writestr(info,src.read(info.filename))
 dst.write('build/dex/classes.dex','classes.dex')
PY
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
VERSION=$(python3 - <<'PY'
import re, xml.etree.ElementTree as ET
version=ET.parse('build/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
assert re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',version)
print(version)
PY
)
"$BT/apksigner" sign --ks "$FOOTBALL_KEYSTORE" --ks-pass "file:$FOOTBALL_KEY_PASSWORD_FILE" --out "build/Football-Lab-$VERSION.apk" build/aligned.apk
"$BT/apksigner" verify --verbose "build/Football-Lab-$VERSION.apk"
