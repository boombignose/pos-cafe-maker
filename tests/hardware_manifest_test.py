import importlib.util
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/hardware/return_manifest.py'

class ManifestTest(unittest.TestCase):
    def test_changed_pcb_drives_holes_connector_and_envelope(self):
        self.assertTrue(SCRIPT.exists(), 'KiCad return tool must exist')
        spec = importlib.util.spec_from_file_location('return_manifest', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        source = '''(kicad_pcb (general (thickness 1.6))
        (gr_rect (start 10 20) (end 90 70) (layer "Edge.Cuts"))
        (footprint "Hole" (at 14 66) (property "Reference" "H1")
          (pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2)))
        (footprint "Terminal" (at 30 50 90) (property "Reference" "J1")
          (property "Value" "DC input") (property "BBN_Width" "10")
          (property "BBN_Height" "8") (property "BBN_Depth" "12")
          (property "BBN_Connector" "screw-terminal")
          (pad "1" thru_hole circle (at 0 0) (net 1 "5V_IN"))
          (pad "2" thru_hole circle (at 5 0) (net 2 "GND"))))'''
        with tempfile.TemporaryDirectory() as directory:
            pcb = pathlib.Path(directory) / 'fixture.kicad_pcb'
            pcb.write_text(source)
            first = module.manifest(pcb)
            self.assertEqual(first['schemaVersion'], 1)
            self.assertEqual(first['board']['width'], 80)
            self.assertEqual(first['board']['holes'], [{'x': 4, 'y': 4, 'diameter': 3.2}])
            self.assertEqual(first['board']['components'][0]['width'], 8)
            self.assertEqual(first['board']['components'][0]['height'], 10)
            connector = first['board']['connectors'][0]
            self.assertEqual((connector['x'], connector['y'], connector['z']), (20,20,1.6))
            self.assertEqual(connector['pins'][1], {'name': '2', 'net': 'GND'})
            pcb.write_text(source.replace('(at 14 66)', '(at 16 65)'))
            changed = module.manifest(pcb)
            self.assertNotEqual(first['sourceHash'], changed['sourceHash'])
            self.assertEqual(changed['board']['holes'][0]['x'], 6)
            self.assertEqual(changed['board']['holes'][0]['y'], 5)
            self.assertFalse(module.is_current(pcb, first))

    def test_incomplete_envelope_fails_closed(self):
        self.assertTrue(SCRIPT.exists(), 'KiCad return tool must exist')
        spec = importlib.util.spec_from_file_location('return_manifest2', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            pcb = pathlib.Path(directory) / 'bad.kicad_pcb'
            pcb.write_text('(kicad_pcb (general (thickness 1.6)) (gr_rect (start 0 0) (end 80 50) (layer "Edge.Cuts")) (footprint "Part" (at 10 10) (property "Reference" "J1")))')
            with self.assertRaisesRegex(ValueError, 'BBN_Width'):
                module.manifest(pcb)

    def test_curved_outline_and_bottom_side_components_are_rejected(self):
        self.assertTrue(SCRIPT.exists(), 'KiCad return tool must exist')
        spec = importlib.util.spec_from_file_location('return_manifest3', SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            pcb = pathlib.Path(directory) / 'unsupported.kicad_pcb'
            outline = '(kicad_pcb (general (thickness 1.6)) (gr_rect (start 0 0) (end 80 50) (layer "Edge.Cuts"))'
            pcb.write_text(outline + ' (gr_arc (start 0 0) (mid 5 5) (end 10 0) (layer "Edge.Cuts")))')
            with self.assertRaisesRegex(ValueError, 'rectangular'):
                module.manifest(pcb)
            pcb.write_text(outline + ' (footprint "Part" (layer "B.Cu") (at 10 10) (property "Reference" "R1")))')
            with self.assertRaisesRegex(ValueError, 'top-side'):
                module.manifest(pcb)

if __name__ == '__main__':
    unittest.main()
