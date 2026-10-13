from pathlib import Path

source_directory = Path(__file__).resolve().parent / "web"
root = source_directory.parent.parent
template = (source_directory / "template.html").read_text()
for marker, filename in [("STYLE", "style.css"), ("CORE", "core.js"), ("VAULT", "vault.js"), ("BANKING", "banking.js"), ("UI", "ui.js")]:
    source = (source_directory / filename).read_text()
    if filename.endswith(".js"):
        source = source.replace("</script", "<\\/script")
    template = template.replace("/* " + marker + " */", source)
output = root / "mes-depenses.html"
output.write_text(template)
print("Self-contained HTML prepared.")
