import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/hardware/validate_export.py'

class HardwareReportsTest(unittest.TestCase):
    def test_real_erc_drc_reports_reject_unconnected_item(self):
        self.assertTrue(SCRIPT.exists(), 'Hardware validation/export gate must exist')
        spec = importlib.util.spec_from_file_location('validate_export', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.require_clean_reports(ROOT / 'hardware/reports')
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory)
            erc = json.loads((ROOT / 'hardware/reports/erc.json').read_text())
            drc = json.loads((ROOT / 'hardware/reports/drc.json').read_text())
            (path/'erc.json').write_text(json.dumps(erc))
            drc['unconnected_items'] = [{'severity':'error', 'description':'Broken fan return'}]
            (path/'drc.json').write_text(json.dumps(drc))
            with self.assertRaisesRegex(ValueError, 'DRC'):
                module.require_clean_reports(path)

    def test_saved_validation_rejects_changed_source(self):
        spec = importlib.util.spec_from_file_location('validate_export2', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            reports = root/'hardware/reports'
            reports.mkdir(parents=True)
            source = root/'board.kicad_pcb'
            source.write_text('original pcb')
            for name in ('erc.json','drc.json'):
                (reports/name).write_bytes((ROOT/'hardware/reports'/name).read_bytes())
            (reports/'validation.json').write_text(json.dumps({'sha256':{'board.kicad_pcb':module.digest(source)}}))
            module.verify_record(root)
            source.write_text('edited pcb')
            with self.assertRaisesRegex(ValueError, 'Stale'):
                module.verify_record(root)

if __name__ == '__main__':
    unittest.main()
