"""Package compiled shop code without credentials/database/dependencies. Run build:shop first."""
from pathlib import Path
import json
import argparse
import zipfile

root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
parser=argparse.ArgumentParser()
parser.add_argument('--out',default=f'../output/pos-cafe-maker/pos-cafe-maker-shop-v{version}.zip')
args=parser.parse_args()
if not (root/'runtime/app.js').is_file() or not (root/'dist/index.html').is_file():
    raise SystemExit('Run npm run build:shop first')
if not (root/'dist/SHOP-MODE.txt').is_file():
    raise SystemExit('dist is not verified as shop mode; run npm run build:shop')
output=Path(args.out).resolve();output.parent.mkdir(parents=True,exist_ok=True)
entries={}
for directory in ['dist','runtime','scripts/shop','scripts/hardware','hardware','examples/models']:
    for file in (root/directory).rglob('*'):
        if file.is_file() and file.suffix not in ['.kicad_prl','.pyc','.log']:
            entries[str(file.relative_to(root))]=file
for name in ['Start.cmd','Backup.cmd','Restore.cmd','start.sh','package.json','package-lock.json','LICENSE','LICENSES/CERN-OHL-P-2.0.txt','THIRD_PARTY.md','docs/INSTALL.md','docs/BACKEND.md','docs/BLUEPRINT.md','docs/DESIGNER.md','docs/HARDWARE.md','docs/PRINTING.md','docs/TEST-REPORT.md']:
    entries[name]=root/name
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,file in sorted(entries.items()):
        info=zipfile.ZipInfo.from_file(file,'pos-cafe-maker-shop/'+name)
        if name=='start.sh':info.external_attr=0o100755<<16
        info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,file.read_bytes())
    archive.writestr('pos-cafe-maker-shop/START-HERE.txt',f'POS Cafe Maker SHOP v{version}\n\nInstall official Node.js 24 LTS and PostgreSQL 17 or 18 first.\nWindows: double-click Start.cmd. First run downloads npm production dependencies.\nRead docs/INSTALL.md for setup token, LAN, backups, restore and update.\n\nShop records persist in your OS user data directory, outside this ZIP.\nPages/browser demo is a separate simulated product. No payment gateway. Hardware is unmanufactured/unprinted.\n')
with zipfile.ZipFile(output) as archive:
    names=archive.namelist()
    assert len(names)==len(set(names))
    assert archive.testzip() is None
    assert not any('/node_modules/' in name or '/.env' in name or name.endswith('/config.json') or 'SETUP-TOKEN' in name for name in names)
print(f'{output}: {output.stat().st_size} bytes, {len(names)} unique files')
