from pathlib import Path

source_directory = Path(__file__).resolve().parent / "web"
root = source_directory.parent.parent
template = (source_directory / "template.html").read_text()
for marker, filename in [("STYLE", "style.css"), ("CONTENT", "content.js"), ("CORE", "core.js"), ("UI", "ui.js")]:
    source = (source_directory / filename).read_text()
    if filename.endswith(".js"):
        source = source.replace("</script", "<\\/script")
    template = template.replace("/* " + marker + " */", source, 1)
(root / "mon-anglais.html").write_text(template)
print("Self-contained HTML prepared.")
