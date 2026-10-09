"""Copy the GitHub-backed app into an existing registered Sites checkout."""
import argparse
import shutil
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('destination', type=Path)
args = parser.parse_args()
web = Path(__file__).resolve().parent
dest = args.destination.resolve()
if not (dest / '.openai/hosting.json').is_file():
    raise SystemExit('Register the Sites checkout before preparing it.')
(dest / 'app/api/football').mkdir(parents=True, exist_ok=True)
(dest / 'lib').mkdir(exist_ok=True)
html = (web.parent.parent / 'football-lab.html').read_text()
html = html.replace('<head>', '<head><meta name="football-relay" content="/api/football">', 1)
(dest / 'football-lab.html').write_text(html)
shutil.copyfile(web / 'relay.mjs', dest / 'lib/football-relay.mjs')
shutil.copyfile(web / 'route.ts', dest / 'app/api/football/route.ts')
shutil.copyfile(web / 'index-route.ts', dest / 'app/route.ts')
(dest / 'app/page.tsx').unlink(missing_ok=True)
(dest / 'app/layout.tsx').write_text('''import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Football Lab",
  description: "Observer les matchs, comparer les probabilités et suivre les prévisions.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body>{children}</body></html>;
}
''')
print('Prepared Football Lab browser app and private relay.')
