import { test } from 'node:test';
import assert from 'node:assert/strict';
import modeling from '@jscad/modeling';
import { unzipSync } from 'fflate';
import { defaultDesign, parseDesign, parseBoardManifest, generateModel, exportPartStl, exportDesignZip } from '../src/designer/model.js';

const { measurements, booleans, primitives } = modeling;
const design = () => defaultDesign();

test('rejects invalid imported units, dimensions, schema versions and hidden oversized geometry', () => {
  const d = design();
  assert.throws(() => parseDesign({ ...d, schemaVersion: 2 }));
  assert.throws(() => parseDesign({ ...d, wall: -1 }));
  assert.throws(() => parseDesign({ ...d, screen: { ...d.screen, activeWidth: 500 } }));
  assert.throws(() => parseBoardManifest({ schemaVersion: 1, board: { name: 'Bad', width: 50, height: 30, thickness: 1.6, holes: [{ x: 900, y: 0, diameter: 3 }], components: [], connectors: [] } }));
  assert.throws(() => parseDesign('not json'));
  assert.throws(() => parseDesign({ ...d, modules: [...d.modules, d.modules[0]] }));
});

test('canonical frame opening, hollow body and lid vents remove material while preserving mm dimensions', () => {
  const d = design();
  const m = generateModel(d);
  assert.deepEqual(m.parts.map(p => p.name), ['frame', 'body', 'lid', 'base']);
  const body = m.parts.find(p => p.name === 'body')!;
  const frame = m.parts.find(p => p.name === 'frame')!;
  assert.ok(measurements.measureVolume(body.geometry) > 0);
  const size = measurements.measureDimensions(frame.geometry);
  assert.ok(Math.abs(size[0] - (d.screen.width + 16)) < 0.01);
  assert.ok(Math.abs(size[1] - (d.screen.height + 16)) < 0.01);
  const probe = primitives.cuboid({ size: [10, 10, 1], center: [0, 0, 1] });
  assert.ok(Math.abs(measurements.measureVolume(booleans.intersect(frame.geometry, probe))) < 0.01, 'front has a genuine opening');
  const cavity = primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 20] });
  assert.ok(Math.abs(measurements.measureVolume(booleans.intersect(body.geometry, cavity))) < 0.01, 'body is hollow');
  const lid = m.parts.find(p => p.name === 'lid')!;
  assert.ok(measurements.measureVolume(booleans.intersect(lid.geometry, primitives.cuboid({ size: [size[0], size[1], d.wall], center: [0, 0, d.depth + d.wall / 2] }))) < size[0] * size[1] * d.wall, 'vents remove lid material');
});

test('PCB manifest holes regenerate real mounting posts and alter printable geometry', () => {
  const d = design();
  const first = generateModel(d);
  const board = d.modules.find(x => x.id === 'accessory')!;
  const changed = structuredClone(d);
  changed.modules.find(x => x.id === 'accessory')!.holes = [...board.holes, { x: board.width / 2, y: board.height / 2, diameter: 2.8 }];
  const next = generateModel(changed);
  assert.equal(next.mountingPosts.length, first.mountingPosts.length + 1);
  assert.notEqual(measurements.measureVolume(first.parts[2].geometry), measurements.measureVolume(next.parts[2].geometry));
});

test('rotation and port changes move modules, remove real wall material and expose collisions', () => {
  const d = design();
  const moved = structuredClone(d);
  moved.modules[0].position = [500, 0, 20];
  assert.ok(generateModel(moved).issues.some(i => i.kind === 'outside'));
  const overlapping = structuredClone(d);
  overlapping.modules[1].position = [...overlapping.modules[0].position];
  assert.ok(generateModel(overlapping).issues.some(i => i.kind === 'collision'));
  const cable = structuredClone(d);
  cable.cableClearance = 200;
  assert.ok(generateModel(cable).issues.some(i => i.kind === 'cable'));
  const noPorts = structuredClone(d);
  noPorts.ports = [];
  assert.ok(measurements.measureVolume(generateModel(noPorts).parts[1].geometry) > measurements.measureVolume(generateModel(d).parts[1].geometry));
});

test('exports binary STL for exactly four print parts with bed limits and restorable JSON, excludes electronics', () => {
  const d = design();
  const m = generateModel(d);
  const files = unzipSync(exportDesignZip(d));
  assert.deepEqual(Object.keys(files).sort(), ['base.stl', 'body.stl', 'design.json', 'frame.stl', 'lid.stl']);
  assert.deepEqual(parseDesign(new TextDecoder().decode(files['design.json'])), d);
  for (const p of m.parts) {
    const bytes = exportPartStl(p);
    const triangles = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
    assert.ok(triangles > 10);
    assert.equal(bytes.length, 84 + triangles * 50);
    assert.ok(p.fitsBed);
  }
  const tooBig = structuredClone(d);
  tooBig.bed = [100, 100, 100];
  assert.ok(generateModel(tooBig).parts.some(p => !p.fitsBed));
  assert.ok(m.electronics.length > 0);
});

test('front screw bores remain open through retaining lip and rotated PCB holes follow placement', () => {
  const d = design();
  const m = generateModel(d);
  const frame = m.parts[0];
  const screw = primitives.cylinder({ radius: 0.5, height: d.wall + 2, center: [(d.screen.width + 16) / 2 - 5, (d.screen.height + 16) / 2 - 5, (d.wall + 2) / 2] });
  assert.ok(Math.abs(measurements.measureVolume(booleans.intersect(frame.geometry, screw))) < 0.01, 'screw is clear through the lip');
  const rotated = structuredClone(d);
  rotated.modules = [{ ...rotated.modules[1], position: [0, 0, 30], rotation: 90 }];
  const next = generateModel(rotated);
  const hole = rotated.modules[0].holes[0];
  const first = next.mountingPosts[0];
  assert.ok(Math.abs(first.position[0] - (rotated.modules[0].height / 2 - hole.y)) < 0.01);
  assert.ok(Math.abs(first.position[1] - (hole.x - rotated.modules[0].width / 2)) < 0.01);
});

test('KiCad manifest accepts source hash and component centers but rejects overhanging footprints', () => {
  const manifest = { schemaVersion: 1, sourceHash: 'a'.repeat(64), board: { name: 'KiCad board', width: 80, height: 50, thickness: 1.6, holes: [{ x: 4, y: 4, diameter: 3.2 }], components: [{ reference: 'J1', name: 'Terminal', x: 40, y: 25, width: 14, height: 10, depth: 8 }], connectors: [] } };
  assert.equal(parseBoardManifest(manifest).components[0].x, 40);
  assert.throws(() => parseBoardManifest({ ...manifest, board: { ...manifest.board, components: [{ ...manifest.board.components[0], x: 1 }] } }));
});

test('actual checked-in KiCad manifest imports with mm metadata and yields four accessory posts', async () => {
  const { readFile } = await import('node:fs/promises');
  const board = parseBoardManifest(await readFile(new URL('../hardware/board.json', import.meta.url), 'utf8'));
  assert.equal(board.width, 80);
  const d = design();
  d.modules = [{ ...board, id: 'accessory', kind: 'board', position: [0, 0, 30], rotation: 0 }];
  assert.equal(generateModel(d).mountingPosts.length, 4);
});

test('accessory fan connector net connects to the fan power pins in the reference wiring', () => {
  const d = design();
  const fan = d.modules.find(m => m.kind === 'fan')!;
  assert.ok(fan.connectors.some(c => c.pins.some(p => p.net === '/ACCESSORY_5V')));
  assert.ok(generateModel(d).wires.some(w => w.net === '/ACCESSORY_5V'));
});

test('lid export places its broad outer surface on the bed so mounting posts print upward', () => {
  const lid = generateModel(design()).parts[2];
  const bytes = exportPartStl(lid);
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vertices: [number, number, number][] = [];
  for (let offset = 84; offset < bytes.length; offset += 50) for (let i = 0; i < 3; i++) vertices.push([data.getFloat32(offset + 12 + i * 12, true), data.getFloat32(offset + 16 + i * 12, true), data.getFloat32(offset + 20 + i * 12, true)]);
  assert.ok(vertices.some(([x, y, z]) => Math.abs(x) < 0.01 && Math.abs(y) < 0.01 && Math.abs(z) < 0.01), 'lid corner broad face starts on Z=0');
});

test('assembled electronics and printed parts are physically separate including screen corners', () => {
  const d = design(), m = generateModel(d);
  for (const electronic of m.electronics) for (const part of m.parts.filter(p => p.name !== 'base')) {
    const volume = Math.abs(measurements.measureVolume(booleans.intersect(electronic.geometry, part.geometry)));
    assert.ok(volume < 0.001, `${electronic.name} interferes with ${part.name}: ${volume} mm³`);
  }
});

test('STL triangle edges form closed two-manifold surfaces at 0.001 mm precision', () => {
  for (const part of generateModel(design()).parts) {
    const bytes = exportPartStl(part), data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), edges = new Map<string, number>();
    for (let offset = 84; offset < bytes.length; offset += 50) {
      const vertices = [0, 1, 2].map(i => [0, 1, 2].map(k => Math.round(data.getFloat32(offset + 12 + i * 12 + k * 4, true) * 1000)).join(','));
      for (let i = 0; i < 3; i++) { const key = [vertices[i], vertices[(i + 1) % 3]].sort().join('|'); edges.set(key, (edges.get(key) ?? 0) + 1); }
    }
    const unmatched = [...edges.values()].filter(count => count !== 2).length;
    assert.equal(unmatched, 0, `${part.name} contains ${unmatched} unmatched triangle edges`);
  }
});

test('canonical assembled transform keeps case and electronics outside base solids', () => {
  const d = design(), m = generateModel(d);
  const assembly = (m as any).assembly;
  assert.ok(assembly, 'assembled placement comes from canonical generator');
  const base = m.parts.find(p => p.name === 'base')!;
  for (const item of [...m.parts.filter(p => p.name !== 'base'), ...m.electronics]) {
    const placed = modeling.transforms.translate(assembly.position, modeling.transforms.rotateX(assembly.rotationX, item.geometry));
    const volume = Math.abs(measurements.measureVolume(booleans.intersect(placed, base.geometry)));
    assert.ok(volume < 0.001, `${item.name} interferes with tilted base: ${volume} mm³`);
  }
  const moved = structuredClone(d); moved.modules[0].position = [87, 0, 30];
  assert.ok(generateModel(moved).issues.some(i => i.kind === 'collision' && i.message.includes('body')));
});

test('reference SBC supply stays electrically independent of accessory and generic MCU nets', () => {
  const sbc = design().modules.find(m => m.id === 'sbc')!;
  assert.deepEqual(sbc.connectors[0].pins.map(p => p.net), ['SBC_5V', 'SBC_GND', 'SBC_TX']);
});

test('tilted support cheeks stay outside the active touchscreen and 20 mm front access corridor', () => {
  for (const activeWidth of [154, 164]) {
    const d = design(); d.screen.activeWidth = activeWidth;
    const m = generateModel(d), base = m.parts.find(p => p.name === 'base')!;
    const frontAccess = primitives.cuboid({ size: [activeWidth + 2 * d.clearance + 6, d.screen.activeHeight, 20], center: [0, 0, d.wall - 10] });
    const assembledAccess = modeling.transforms.translate(m.assembly.position, modeling.transforms.rotateX(m.assembly.rotationX, frontAccess));
    const blocked = Math.abs(measurements.measureVolume(booleans.intersect(base.geometry, assembledAccess)));
    assert.ok(blocked < 0.001, `base blocks active area/front finger access by ${blocked} mm³`);
    assert.ok(base.fitsBed, 'outboard support still fits the default 220 mm print bed');
  }
});

test('default front perspective view has no base geometry between the eye and active glass', () => {
  const d = design(), m = generateModel(d), span = Math.max(d.screen.width, d.screen.height, d.depth);
  const camera: [number, number, number] = [span * 1.35, span * 1.8, span * 1.4];
  const activeCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const point: [number, number, number] = [x * d.screen.activeWidth / 2, y * d.screen.activeHeight / 2, d.wall];
    const anchor = modeling.transforms.translate(m.assembly.position, modeling.transforms.rotateX(m.assembly.rotationX, primitives.cuboid({ size: [0.001, 0.001, 0.001], center: point })));
    return anchor;
  });
  const viewCone = modeling.hulls.hull(primitives.cuboid({ size: [0.001, 0.001, 0.001], center: camera }), ...activeCorners);
  const obstructed = Math.abs(measurements.measureVolume(booleans.intersect(m.parts[3].geometry, viewCone)));
  assert.ok(obstructed < 0.001, `perspective view is obstructed by ${obstructed} mm³ of base`);
});
