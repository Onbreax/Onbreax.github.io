#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?Set ANDROID_HOME to an Android SDK with platform 35 and build-tools 35.0.0}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
: "${FOOTBALL_KEYSTORE:?Set FOOTBALL_KEYSTORE to a private signing keystore}"
: "${FOOTBALL_KEY_PASSWORD_FILE:?Set FOOTBALL_KEY_PASSWORD_FILE to its password file}"
export PATH="$JAVA_HOME/bin:$PATH"
BT="$ANDROID_HOME/build-tools/35.0.0"
JAR="$ANDROID_HOME/platforms/android-35/android.jar"
mkdir -p build/classes build/dex
"$BT/aapt2" compile --dir res -o build/resources.zip
"$BT/aapt2" link -o build/base.apk --manifest AndroidManifest.xml -I "$JAR" -A assets build/resources.zip
javac -source 8 -target 8 -classpath "$JAR" -d build/classes src/fr/onbreax/footballlab/MainActivity.java
jar cf build/classes.jar -C build/classes .
"$BT/d8" --lib "$JAR" --min-api 26 --output build/dex build/classes.jar
python3 - <<'PY'
import zipfile
with zipfile.ZipFile('build/base.apk') as src, zipfile.ZipFile('build/unsigned.apk','w',zipfile.ZIP_DEFLATED) as dst:
 for info in src.infolist():dst.writestr(info,src.read(info.filename))
 dst.write('build/dex/classes.dex','classes.dex')
PY
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$FOOTBALL_KEYSTORE" --ks-pass "file:$FOOTBALL_KEY_PASSWORD_FILE" --out build/Football-Lab-1.1.1.apk build/aligned.apk
"$BT/apksigner" verify --verbose build/Football-Lab-1.1.1.apk
