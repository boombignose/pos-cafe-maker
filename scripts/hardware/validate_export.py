#!/usr/bin/env python3
"""Require real KiCad 10 ERC/DRC before producing manufacturing artifacts."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def require_clean_reports(directory):
    erc = json.loads((directory/'erc.json').read_text())
    drc = json.loads((directory/'drc.json').read_text())
    for label, report, violations in [('ERC',erc,[v for sheet in erc['sheets'] for v in sheet['violations']]),('DRC',drc,drc['violations']+drc['unconnected_items']+drc['schematic_parity'])]:
        if not report.get('kicad_version','').startswith('10.'):
            raise ValueError(label + ' must come from KiCad 10')
        if violations:
            raise ValueError(label + ' must have zero errors, warnings, exclusions and parity issues')
        if set(report.get('included_severities',[])) != {'error','warning','exclusion'}:
            raise ValueError(label + ' report must include every severity')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_record(root=ROOT):
    record = json.loads((root/'hardware/reports/validation.json').read_text())
    for name,expected in record['sha256'].items():
        path = root/name
        if not path.is_file() or digest(path) != expected:
            raise ValueError('Stale or missing hardware artifact: '+name)
    require_clean_reports(root/'hardware/reports')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Verify saved artifact/source hashes without rerunning KiCad')
    args = parser.parse_args()
    if args.check:
        verify_record()
        print('Hardware source and manufacturing hashes are current; saved KiCad10 reports clean')
        return
    cli = os.environ.get('KICAD_CLI') or shutil.which('kicad-cli')
    if not cli:
        raise ValueError('KiCad10 kicad-cli unavailable; set KICAD_CLI to its executable')
    version = subprocess.check_output([cli,'version'],text=True).strip()
    if not version.startswith('10.'):
        raise ValueError('KiCad10 required; got '+version)
    reports=ROOT/'hardware/reports'; manufacturing=ROOT/'hardware/manufacturing'
    reports.mkdir(parents=True,exist_ok=True);manufacturing.mkdir(parents=True,exist_ok=True)
    pcb=ROOT/'hardware/sources/accessory.kicad_pcb'; sch=pcb.with_suffix('.kicad_sch')
    commands = [
        ['sch','erc','--severity-all','--exit-code-violations','--format','json','-o',str(reports/'erc.json'),str(sch)],
        ['pcb','drc','--schematic-parity','--severity-all','--exit-code-violations','--format','json','-o',str(reports/'drc.json'),str(pcb)],
    ]
    logs=[]
    environment = os.environ.copy()
    if sys.platform == 'darwin' and 'FONTCONFIG_FILE' not in environment:
        environment['FONTCONFIG_FILE'] = str(ROOT/'scripts/hardware/fonts.conf')
    def run(command):
        result=subprocess.run([cli]+command,text=True,capture_output=True,env=environment)
        logs.append('$ kicad-cli '+' '.join(command)+'\n'+result.stdout+result.stderr)
        (reports/'commands.log').write_text('\n'.join(logs))
        if result.returncode:
            raise RuntimeError('KiCad command failed: '+' '.join(command)+'\n'+result.stdout+result.stderr)
    for command in commands:run(command)
    require_clean_reports(reports)
    subprocess.run([sys.executable,str(ROOT/'scripts/hardware/return_manifest.py'),str(pcb),str(ROOT/'hardware/board.json')],check=True)
    for command in [
        ['sch','export','pdf','-o',str(manufacturing/'accessory-schematic.pdf'),str(sch)],
        ['pcb','export','gerbers','-l','F.Cu,B.Cu,F.Mask,B.Mask,F.SilkS,B.SilkS,Edge.Cuts','-o',str(manufacturing/'gerbers')+'/',str(pcb)],
        ['pcb','export','drill','--excellon-separate-th','--generate-map','--map-format','svg','--generate-report','--report-path',str(reports/'drill.txt'),'-o',str(manufacturing/'gerbers')+'/',str(pcb)],
        ['pcb','export','svg','--layers','F.Cu,B.Cu,F.SilkS,F.Fab,Edge.Cuts','--mode-single','--fit-page-to-board','--exclude-drawing-sheet','-o',str(manufacturing/'accessory-layout.svg'),str(pcb)],
        ['pcb','export','step','--force','--board-only','--include-tracks','--include-pads','-o',str(manufacturing/'accessory-board.step'),str(pcb)],
    ]:run(command)
    files=[p for folder in ['hardware/sources','hardware/manufacturing'] for p in (ROOT/folder).rglob('*') if p.is_file()]
    files.extend([ROOT/'hardware/board.json',ROOT/'hardware/BOM.csv',ROOT/'hardware/wiring.json',ROOT/'hardware/wiring.svg',reports/'erc.json',reports/'drc.json'])
    record={'status':'digital-checks-pass; physical-prototype-unverified','kicadVersion':version,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':{str(p.relative_to(ROOT)):digest(p) for p in sorted(files)}}
    (reports/'validation.json').write_text(json.dumps(record,indent=2)+'\n')
    verify_record()
    print('KiCad10 ERC/DRC/parity clean; manufacturing exports generated and hashed')

if __name__=='__main__':
    try:main()
    except (ValueError,RuntimeError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
