#!/usr/bin/env python3
"""Check compatibility declarations in the packaged binary Android manifest."""
import argparse
from pathlib import Path
import re
import subprocess


def check_package(apk, aapt):
    dump = subprocess.check_output(
        [aapt, "dump", "xmltree", str(apk), "AndroidManifest.xml"], text=True
    )
    elements = []
    current = None
    for line in dump.splitlines():
        match = re.match(r"\s*E: ([\w-]+)", line)
        if match:
            current = {"name": match[1], "attributes": {}}
            elements.append(current)
        elif current is not None:
            attribute = re.search(r"A: android:(\w+).*?=\(type 0x[\da-f]+\)(0x[\da-f]+)", line)
            if attribute:
                current["attributes"][attribute[1]] = int(attribute[2], 16)
    sdk_nodes = [e for e in elements if e["name"] == "uses-sdk"]
    app_nodes = [e for e in elements if e["name"] == "application"]
    assert len(sdk_nodes) == len(app_nodes) == 1, "One SDK and one application declaration required"
    sdk, app = sdk_nodes[0], app_nodes[0]
    assert elements.index(sdk) < elements.index(app), (
        "uses-sdk follows application: Android can derive legacy compatibility flags"
    )
    gradle = Path(__file__).with_name("app").joinpath("build.gradle").read_text()
    for field, attr in (("minSdk", "minSdkVersion"), ("targetSdk", "targetSdkVersion")):
        expected = int(re.search(r"\b" + field + r"\s+(\d+)", gradle)[1])
        assert sdk["attributes"].get(attr) == expected, attr + " differs from Gradle"
    assert app["attributes"].get("resizeableActivity") == 0xFFFFFFFF, "Application must be resizable"
    assert app["attributes"].get("hardwareAccelerated") == 0xFFFFFFFF, "WebView hardware rendering required"
    activities = [e for e in elements if e["name"] == "activity"]
    assert activities, "Missing activity"
    for activity in activities:
        assert activity["attributes"].get("resizeableActivity") == 0xFFFFFFFF, "Activity must be resizable"
        assert "screenOrientation" not in activity["attributes"], "Fixed orientation restricts display sizes"
    for node in [app, *activities]:
        assert "minAspectRatio" not in node["attributes"], "No minimum aspect ratio restriction"
        assert "maxAspectRatio" not in node["attributes"], "No maximum aspect ratio restriction"
    print("Packaged manifest: SDK first, resizable window, unrestricted aspect ratio and hardware rendering passed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--aapt", required=True)
    args = parser.parse_args()
    check_package(args.apk, args.aapt)
