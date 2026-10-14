"""Package the built browser demo; run npm run build first. No secrets or node_modules."""
from pathlib import Path
import argparse
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--out', default='../output/pos-cafe-maker/pos-cafe-maker-demo-v0.1.1.zip')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
output = Path(args.out).resolve()
if not (root / 'dist/index.html').is_file():
    raise SystemExit('Build missing: run npm run build first')
output.parent.mkdir(parents=True, exist_ok=True)
entries = {}
for file in (root / 'dist').rglob('*'):
    if file.is_file():
        entries[str(file.relative_to(root / 'dist'))] = file
for directory in ['hardware', 'examples/models']:
    for file in (root / directory).rglob('*'):
        if file.is_file() and file.suffix not in ['.kicad_prl', '.log', '.pyc']:
            entries[str(file.relative_to(root))] = file
for name in ['LICENSE', 'LICENSES/CERN-OHL-P-2.0.txt', 'docs/BLUEPRINT.md', 'docs/DESIGNER.md', 'docs/HARDWARE.md', 'docs/PRINTING.md', 'THIRD_PARTY.md']:
    entries[name] = root / name
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, file in sorted(entries.items()):
        archive.write(file, 'pos-cafe-maker-demo/' + name)
    archive.writestr('pos-cafe-maker-demo/START-HERE.txt', 'POS Cafe Maker DEMO v0.1.1\n\nRun: python3 -m http.server 8080 --bind 127.0.0.1\nOpen: http://localhost:8080\n\nSimulated local browser records. No Docker, database or API key. Hardware is an unmanufactured and untested physical prototype. Read docs before printing/wiring.\n')
with zipfile.ZipFile(output) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'duplicate archive entries'
    assert 'pos-cafe-maker-demo/index.html' in names
    assert not any('/node_modules/' in name or name.endswith('/.env') for name in names)
    assert archive.testzip() is None, 'archive checksum failure'
print(f'{output}: {output.stat().st_size} bytes, {len(names)} unique files')
