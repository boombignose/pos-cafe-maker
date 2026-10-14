import modeling from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types.js';
import stlSerializer from '@jscad/stl-serializer';
import { strToU8, zipSync } from 'fflate';
import { z } from 'zod';
import accessoryManifest from '../../hardware/board.json';

const { primitives, booleans, transforms, extrusions, measurements, geometries } = modeling;
const dim = z.number().finite().min(0.1).max(300);
const label = z.string().trim().min(1).max(100);
const position = z.tuple([z.number().finite().min(-500).max(500), z.number().finite().min(-500).max(500), z.number().finite().min(0).max(500)]);
const holeSchema = z.object({ x: z.number().finite().min(0).max(300), y: z.number().finite().min(0).max(300), diameter: z.number().finite().min(1).max(12) }).strict();
const componentSchema = z.object({ reference: label, name: label, x: z.number().finite().min(0).max(300), y: z.number().finite().min(0).max(300), width: dim, height: dim, depth: dim }).strict();
const connectorSchema = z.object({ id: label, name: label, x: z.number().finite().min(0).max(300), y: z.number().finite().min(0).max(300), z: z.number().finite().min(0).max(80), type: label, pins: z.array(z.object({ name: label, net: label, voltage: z.union([z.number().finite(), z.string().max(40)]).optional() }).strict()).max(80) }).strict();
const boardShape = { name: label, width: dim, height: dim, thickness: z.number().finite().min(0.5).max(30), holes: z.array(holeSchema).max(40), components: z.array(componentSchema).max(120), connectors: z.array(connectorSchema).max(40) };
function validBoard(b: { width: number; height: number; holes: { x: number; y: number; diameter: number }[]; components: { x: number; y: number; width: number; height: number }[]; connectors: { id: string; x: number; y: number }[] }) {
  return b.holes.every(h => h.x >= h.diameter / 2 && h.y >= h.diameter / 2 && h.x + h.diameter / 2 <= b.width && h.y + h.diameter / 2 <= b.height)
    && b.components.every(c => c.x - c.width / 2 >= 0 && c.y - c.height / 2 >= 0 && c.x + c.width / 2 <= b.width && c.y + c.height / 2 <= b.height)
    && b.connectors.every(c => c.x <= b.width && c.y <= b.height)
    && new Set(b.connectors.map(c => c.id)).size === b.connectors.length;
}
const boardSchema = z.object(boardShape).strict().refine(validBoard, 'ตำแหน่งรู / อุปกรณ์ / connector ต้องอยู่ภายในบอร์ด และ id ต้องไม่ซ้ำ');
const moduleSchema = z.object({ ...boardShape, id: label, kind: z.enum(['board', 'fan']), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), sourceFile: label.optional(), position, rotation: z.number().finite().min(-360).max(360) }).strict().refine(validBoard, 'ตำแหน่งบนบอร์ดไม่ถูกต้อง');
const screenSchema = z.object({ width: z.number().finite().min(60).max(300), height: z.number().finite().min(45).max(300), activeWidth: dim, activeHeight: dim, thickness: z.number().finite().min(1).max(30) }).strict();
const portSchema = z.object({ id: label, name: label, face: z.enum(['left', 'right', 'top', 'bottom']), offset: z.number().finite().min(-140).max(140), z: z.number().finite().min(0).max(160), width: z.number().finite().min(2).max(70), height: z.number().finite().min(2).max(50) }).strict();
const designSchema = z.object({ schemaVersion: z.literal(1), units: z.literal('mm'), name: label, screen: screenSchema, wall: z.number().finite().min(1.2).max(6), clearance: z.number().finite().min(0).max(2), depth: z.number().finite().min(25).max(160), tilt: z.number().finite().min(30).max(75), cableClearance: z.number().finite().min(3).max(200), bed: z.tuple([dim, dim, dim]), modules: z.array(moduleSchema).max(16), ports: z.array(portSchema).max(20) }).strict().superRefine((d, ctx) => {
  if (d.modules.reduce((n, m) => n + m.components.length + m.holes.length + m.connectors.length, 0) > 240) ctx.addIssue({ code: 'custom', message: 'จำนวนชิ้นส่วน / รู / connector รวมต้องไม่เกิน 240' });
  if (d.screen.activeWidth + 2 * d.clearance >= d.screen.width || d.screen.activeHeight + 2 * d.clearance >= d.screen.height) ctx.addIssue({ code: 'custom', message: 'พื้นที่แสดงผลต้องเล็กกว่าขอบนอกจอ' });
  if (d.depth <= d.screen.thickness + 2 * d.wall + 5) ctx.addIssue({ code: 'custom', message: 'กล่องตื้นกว่าความหนาจอ' });
  if (new Set(d.modules.map(m => m.id)).size !== d.modules.length || new Set(d.ports.map(m => m.id)).size !== d.ports.length) ctx.addIssue({ code: 'custom', message: 'id อุปกรณ์ / ช่องพอร์ตต้องไม่ซ้ำ' });
  for (const p of d.ports) {
    const span = p.face === 'left' || p.face === 'right' ? d.screen.height + 16 : d.screen.width + 16;
    if (Math.abs(p.offset) + p.width / 2 >= span / 2 - d.wall || p.z - p.height / 2 <= d.wall || p.z + p.height / 2 >= d.depth) ctx.addIssue({ code: 'custom', message: `ช่อง ${p.name} เกินผนังกล่อง` });
  }
});
export type Design = z.infer<typeof designSchema>;
export type Board = z.infer<typeof boardSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Vec3 = [number, number, number];
export type PrintPart = { name: 'frame' | 'body' | 'lid' | 'base'; geometry: Geom3; dimensions: Vec3; fitsBed: boolean };
export type Electronic = { id: string; name: string; geometry: Geom3; color: string; kind: 'screen' | 'board' | 'fan' | 'component' };
export type ModelIssue = { kind: 'outside' | 'collision' | 'cable' | 'bed'; message: string };
export type Cable = { id: string; name: string; moduleId: string; geometry: Geom3; point: Vec3; pins: Board['connectors'][number]['pins'] };
export type Model = { parts: PrintPart[]; electronics: Electronic[]; cables: Cable[]; wires: { net: string; from: Vec3; to: Vec3 }[]; mountingPosts: { moduleId: string; position: Vec3; diameter: number; height: number }[]; issues: ModelIssue[]; assembly: { rotationX: number; position: Vec3 } };

function imported(value: unknown) {
  if (typeof value !== 'string') return value;
  if (value.length > 1_000_000) throw new Error('ไฟล์ใหญ่เกิน 1 MB');
  try { return JSON.parse(value); } catch { throw new Error('ไฟล์ต้องเป็น JSON ที่ถูกต้อง'); }
}
export function parseDesign(value: unknown): Design { return designSchema.parse(imported(value)); }
export function parseBoardManifest(value: unknown): Board & { sourceHash?: string; sourceFile?: string } {
  const manifest = z.object({ schemaVersion: z.literal(1), units: z.literal('mm').optional(), coordinateSystem: z.literal('lower-left; component envelopes centered; depth above PCB top').optional(), sourceFile: label.optional(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), board: boardSchema }).strict().parse(imported(value));
  return { ...manifest.board, ...(manifest.sourceHash ? { sourceHash: manifest.sourceHash } : {}), ...(manifest.sourceFile ? { sourceFile: manifest.sourceFile } : {}) };
}
const cornerHoles = (width: number, height: number, inset = 3.5) => [
  { x: inset, y: inset, diameter: 2.8 }, { x: width - inset, y: inset, diameter: 2.8 },
  { x: inset, y: height - inset, diameter: 2.8 }, { x: width - inset, y: height - inset, diameter: 2.8 },
];
export const BOARD_CATALOG: { id: string; description: string; board: Board }[] = [
  { id: 'sbc', description: 'ขนาด/รู/ชิ้นส่วนสมมติสำหรับจัดวาง • ไม่อ้างอิงสินค้ารุ่นใด', board: { name: 'SBC แม่แบบขนาด', width: 85, height: 56, thickness: 1.6, holes: [{ x: 3.5, y: 3.5, diameter: 2.8 }, { x: 61.5, y: 3.5, diameter: 2.8 }, { x: 3.5, y: 52.5, diameter: 2.8 }, { x: 61.5, y: 52.5, diameter: 2.8 }], components: [{ reference: 'USB', name: 'USB stack', x: 76.5, y: 25, width: 17, height: 20, depth: 16 }, { reference: 'CPU', name: 'CPU + heatsink envelope', x: 42, y: 27, width: 24, height: 24, depth: 12 }], connectors: [] } },
  { id: 'pico', description: 'ขนาด/รูสมมติสำหรับจัดวาง • ต้องแทนด้วยข้อมูลบอร์ดที่เลือก', board: { name: 'MCU แม่แบบขนาด', width: 51, height: 21, thickness: 1.6, holes: cornerHoles(51, 21, 2.5), components: [{ reference: 'MCU', name: 'Microcontroller', x: 26, y: 11, width: 12, height: 12, depth: 3 }], connectors: [] } },
  { id: 'accessory', description: 'ขอบบอร์ด/รู/net จาก KiCad ใน repo • envelope เป็นค่าที่ออกแบบเผื่อ', board: parseBoardManifest(accessoryManifest) },
  { id: 'fan', description: 'ขนาด/รูสมมติ 40 × 40 × 10 mm • ยังไม่ได้เลือกพัดลมรุ่นจริง', board: { name: 'พัดลมแม่แบบขนาด', width: 40, height: 40, thickness: 10, holes: cornerHoles(40, 40, 4), components: [], connectors: [] } },
];
export function defaultDesign(): Design {
  return parseDesign({ schemaVersion: 1, units: 'mm', name: 'POS Café reference blueprint', screen: { width: 164.9, height: 106.96, activeWidth: 154.21, activeHeight: 85.92, thickness: 8 }, wall: 2.4, clearance: 0.3, depth: 50, tilt: 60, cableClearance: 12, bed: [220, 220, 250], modules: [
    { ...structuredClone(BOARD_CATALOG[0].board), id: 'sbc', kind: 'board', position: [-38, 23.5, 30], rotation: 0 },
    { ...structuredClone(BOARD_CATALOG[2].board), id: 'accessory', kind: 'board', position: [40, -30, 30], rotation: 0 },
    { ...structuredClone(BOARD_CATALOG[3].board), id: 'fan', kind: 'fan', position: [52, 29, 31], rotation: 0 },
  ], ports: [
    { id: 'usb', name: 'USB / service', face: 'right', offset: -4, z: 30, width: 18, height: 12 },
    { id: 'power', name: '5V power', face: 'left', offset: -24, z: 28, width: 12, height: 9 },
  ] });
}
export function replaceAccessory(d: Design, board: Board): Design {
  const previous = d.modules.find(m => m.id === 'accessory');
  const next = { ...structuredClone(board), id: 'accessory', kind: 'board' as const, position: previous?.position ?? [0, 0, 30] as Vec3, rotation: previous?.rotation ?? 0 };
  return parseDesign({ ...d, modules: [...d.modules.filter(m => m.id !== 'accessory'), next] });
}
const box = (size: Vec3, center: Vec3 = [0, 0, 0]) => primitives.cuboid({ size, center });
const roundedBox = (size: Vec3, center: Vec3, radius = 6) => transforms.translate([center[0], center[1], center[2] - size[2] / 2], extrusions.extrudeLinear({ height: size[2] }, primitives.roundedRectangle({ size: [size[0], size[1]], roundRadius: Math.min(radius, size[0] / 4, size[1] / 4), segments: 24 })));
const cylinder = (radius: number, height: number, center: Vec3) => primitives.cylinder({ radius, height, center, segments: 32 });
const radians = (degrees: number) => degrees * Math.PI / 180;
const modulePoint = (m: Module, local: Vec3): Vec3 => {
  const a = radians(m.rotation), x = local[0] - m.width / 2, y = local[1] - m.height / 2;
  return [m.position[0] + x * Math.cos(a) - y * Math.sin(a), m.position[1] + x * Math.sin(a) + y * Math.cos(a), m.position[2] + local[2]];
};
const place = (m: Module, geometry: Geom3) => transforms.translate(m.position, transforms.rotateZ(radians(m.rotation), geometry));
type Bounds = [Vec3, Vec3];
const bounds = (g: Geom3): Bounds => measurements.measureBoundingBox(g) as Bounds;
// shortcut: AABB clearance may overreport rotated solids, upgrade to exact intersection with measured cable envelopes for physical fit.
const overlap = (a: Bounds, b: Bounds, c = 0) => a[0].every((v, i) => v < b[1][i] + c && a[1][i] > b[0][i] - c);
const inside = (a: Bounds, b: Bounds) => a[0].every((v, i) => v >= b[0][i] && a[1][i] <= b[1][i]);

export function generateModel(input: Design): Model {
  const d = parseDesign(input), w = d.screen.width + 16, h = d.screen.height + 16, wall = d.wall;
  const issues: ModelIssue[] = [], electronics: Electronic[] = [], cables: Cable[] = [], mountingPosts: Model['mountingPosts'] = [];
  const corners: Vec3[] = [[-w / 2 + 5, -h / 2 + 5, 0], [w / 2 - 5, -h / 2 + 5, 0], [-w / 2 + 5, h / 2 - 5, 0], [w / 2 - 5, h / 2 - 5, 0]];
  const screwHoles = (zPos: number, depth: number) => corners.map(([x, y]) => cylinder(1.6 + d.clearance / 2, depth, [x, y, zPos]));
  let frame = booleans.subtract(roundedBox([w, h, wall], [0, 0, wall / 2]), box([d.screen.activeWidth + 2 * d.clearance, d.screen.activeHeight + 2 * d.clearance, wall + 2], [0, 0, wall / 2]), ...screwHoles(wall / 2, wall + 2));
  // Rear lip keeps the screen centered; its opening leaves the physical panel removable.
  const lipDepth = Math.min(2, d.screen.thickness), outerLipW = d.screen.width + 2 * d.clearance + 2 * wall, outerLipH = d.screen.height + 2 * d.clearance + 2 * wall;
  const lip = booleans.subtract(box([outerLipW, outerLipH, lipDepth], [0, 0, wall + lipDepth / 2]), box([d.screen.width + 2 * d.clearance, d.screen.height + 2 * d.clearance, lipDepth + 2], [0, 0, wall + lipDepth / 2]));
  frame = booleans.subtract(booleans.union(frame, lip), ...screwHoles((wall + lipDepth) / 2, wall + lipDepth + 2));
  let body = booleans.subtract(roundedBox([w, h, d.depth - wall], [0, 0, (d.depth + wall) / 2]), roundedBox([w - 2 * wall, h - 2 * wall, d.depth + 2], [0, 0, d.depth / 2], Math.max(1, 6 - wall)));
  const bossStart = wall + lipDepth + d.clearance;
  const bodyPosts = corners.map(([x, y]) => booleans.subtract(cylinder(1.4 + wall, d.depth - bossStart, [x, y, (d.depth + bossStart) / 2]), cylinder(1.4, d.depth + 2, [x, y, d.depth / 2])));
  body = booleans.union(body, ...bodyPosts);
  const recessDepth = Math.min(1.3, wall / 2);
  frame = booleans.subtract(frame, ...corners.map(([x, y]) => primitives.cylinderElliptic({ height: recessDepth + 0.02, startRadius: [3, 3], endRadius: [1.7, 1.7], center: [x, y, recessDepth / 2 - 0.01], segments: 32 })));
  const screenKeepout = box([d.screen.width + 2 * d.clearance, d.screen.height + 2 * d.clearance, d.screen.thickness + 2 * d.clearance], [0, 0, wall + d.screen.thickness / 2]);
  body = booleans.subtract(body, screenKeepout);
  const portCuts = d.ports.map(p => p.face === 'left' || p.face === 'right' ? box([wall * 3, p.width + 2 * d.clearance, p.height + 2 * d.clearance], [(p.face === 'left' ? -1 : 1) * w / 2, p.offset, p.z]) : box([p.width + 2 * d.clearance, wall * 3, p.height + 2 * d.clearance], [p.offset, (p.face === 'bottom' ? -1 : 1) * h / 2, p.z]));
  if (portCuts.length) body = booleans.subtract(body, ...portCuts);
  const vents: Geom3[] = [];
  for (let y = -h / 2 + 18; y <= h / 2 - 18; y += 10) vents.push(box([Math.min(w - 36, 100), 3, wall + 2], [0, y, d.depth + wall / 2]));
  let lid = booleans.subtract(roundedBox([w, h, wall], [0, 0, d.depth + wall / 2]), ...vents, ...screwHoles(d.depth + wall / 2, wall + 2));
  electronics.push({ id: 'screen', name: 'จอ / screen', kind: 'screen', color: '#172c41', geometry: box([d.screen.width, d.screen.height, d.screen.thickness], [0, 0, wall + d.screen.thickness / 2]) });
  const moduleEnvelopes: { id: string; name: string; bounds: Bounds }[] = [];
  const inner: Bounds = [[-w / 2 + wall + d.clearance, -h / 2 + wall + d.clearance, wall + d.screen.thickness + d.clearance], [w / 2 - wall - d.clearance, h / 2 - wall - d.clearance, d.depth - d.clearance]];
  const printedPosts: Geom3[] = [];
  for (const m of d.modules) {
    let boardGeo = box([m.width, m.height, m.thickness]);
    if (m.kind === 'fan') boardGeo = booleans.subtract(boardGeo, cylinder(m.width * 0.36, m.thickness + 2, [0, 0, 0]));
    if (m.holes.length) boardGeo = booleans.subtract(boardGeo, ...m.holes.map(hole => cylinder(hole.diameter / 2, m.thickness + 2, [hole.x - m.width / 2, hole.y - m.height / 2, 0])));
    electronics.push({ id: m.id, name: m.name, kind: m.kind, color: m.kind === 'fan' ? '#394151' : '#259768', geometry: place(m, boardGeo) });
    const all: Geom3[] = [place(m, boardGeo)];
    for (const c of m.components) {
      const g = place(m, box([c.width, c.height, c.depth], [c.x - m.width / 2, c.y - m.height / 2, m.thickness / 2 + c.depth / 2]));
      all.push(g);
      electronics.push({ id: `${m.id}/${c.reference}`, name: `${c.reference} · ${c.name}`, kind: 'component', color: '#9aa4b4', geometry: g });
    }
    const b = bounds(booleans.union(...all));
    moduleEnvelopes.push({ id: m.id, name: m.name, bounds: b });
    if (!inside(b, inner)) issues.push({ kind: 'outside', message: `${m.name}: อุปกรณ์ / ความสูงชิ้นส่วนเกินพื้นที่ภายในกล่อง` });
    for (const hole of m.holes) {
      const p = modulePoint(m, [hole.x, hole.y, m.thickness / 2]);
      const height = d.depth - p[2], radius = hole.diameter / 2 + wall;
      if (height < 3 || p[0] - radius < inner[0][0] || p[0] + radius > inner[1][0] || p[1] - radius < inner[0][1] || p[1] + radius > inner[1][1]) {
        issues.push({ kind: 'outside', message: `${m.name}: รูยึดไม่มีพื้นที่รองรับเสาถึงฝาหลัง (ต้องเหลือ ≥3 mm)` });
        continue;
      }
      mountingPosts.push({ moduleId: m.id, position: p, diameter: hole.diameter, height });
      // A continuous annular boss joins the lid through 0.05 mm overlap.
      const boss = cylinder(radius, height + 0.05, [p[0], p[1], p[2] + height / 2 + 0.025]);
      const holeCut = cylinder(hole.diameter / 2 + d.clearance / 2, height + wall + 2, [p[0], p[1], p[2] + (height + wall) / 2]);
      printedPosts.push(booleans.subtract(boss, holeCut));
      lid = booleans.subtract(lid, holeCut);
    }
    for (const c of m.connectors) {
      const point = modulePoint(m, [c.x, c.y, c.z]);
      const geo = place(m, box([8 + 2 * d.clearance, 8 + 2 * d.clearance, d.cableClearance], [c.x - m.width / 2, c.y - m.height / 2, c.z + d.cableClearance / 2]));
      cables.push({ id: `${m.id}/${c.id}`, moduleId: m.id, name: `${m.name} · ${c.name}`, geometry: geo, point, pins: c.pins });
    }
  }
  if (printedPosts.length) {
    // Keep material under mounting posts; reapply every screw hole after the union.
    const pads = mountingPosts.map(p => cylinder(p.diameter / 2 + wall, wall, [p.position[0], p.position[1], d.depth + wall / 2]));
    lid = booleans.union(lid, ...printedPosts, ...pads);
    lid = booleans.subtract(lid, ...mountingPosts.map(p => cylinder(p.diameter / 2 + d.clearance / 2, p.height + wall + 2, [p.position[0], p.position[1], p.position[2] + (p.height + wall) / 2])), ...screwHoles(d.depth + wall / 2, wall + 2));
  }
  for (let i = 0; i < moduleEnvelopes.length; i++) for (let j = i + 1; j < moduleEnvelopes.length; j++) if (overlap(moduleEnvelopes[i].bounds, moduleEnvelopes[j].bounds, d.clearance)) issues.push({ kind: 'collision', message: `${moduleEnvelopes[i].name} ชน / เข้าใกล้ ${moduleEnvelopes[j].name}` });
  for (const c of cables) {
    const b = bounds(c.geometry);
    if (!inside(b, inner) || moduleEnvelopes.some(m => m.id !== c.moduleId && overlap(b, m.bounds, d.clearance))) issues.push({ kind: 'cable', message: `${c.name}: ระยะเสียบหัวต่อ / งอสาย ${d.cableClearance} mm ชนกล่องหรืออุปกรณ์` });
  }
  const wires: Model['wires'] = [];
  const netEndpoints = new Map<string, Vec3[]>();
  for (const c of cables) for (const p of c.pins) netEndpoints.set(p.net, [...(netEndpoints.get(p.net) ?? []), c.point]);
  for (const [net, points] of netEndpoints) for (let i = 1; i < points.length; i++) wires.push({ net, from: points[0], to: points[i] });
  const mountX = Math.min(40, w / 2 - 12), mountY = Math.min(25, h / 2 - 12);
  const fastening = [-mountX, mountX].flatMap(x => [-mountY, mountY].map(y => [x, y, d.depth + wall / 2] as Vec3));
  const rearStops: Geom3[] = [];
  const screenBack = wall + d.screen.thickness + d.clearance;
  for (const side of [-1, 1]) for (const y of [-d.screen.height / 2 + 8, d.screen.height / 2 - 8]) {
    rearStops.push(box([3, 8, d.depth - screenBack + 0.05], [side * (d.screen.width / 2 + 2), y, (d.depth + screenBack) / 2 + 0.025]));
    rearStops.push(box([7, 8, wall], [side * (d.screen.width / 2 - 0.5), y, screenBack + wall / 2]));
  }
  lid = booleans.union(lid, ...rearStops, ...fastening.map(([x, y]) => cylinder(6, wall * 3, [x, y, d.depth - wall / 2])));
  const screwBores = fastening.map(([x, y]) => cylinder(1.7, wall * 5, [x, y, d.depth]));
  const nutPockets = fastening.map(([x, y]) => primitives.cylinder({ radius: 3.3, height: wall + 0.2, center: [x, y, d.depth - wall * 2 + wall / 2 - 0.1], segments: 6 }));
  const tieSlots = [-1, 1].flatMap(side => [-7, 7].map(y => box([3, 6, wall + 2], [side * (mountX + 12), y, d.depth + wall / 2])));
  lid = booleans.subtract(lid, ...screwBores, ...nutPockets, ...tieSlots);
  const assembly = { rotationX: radians(d.tilt), position: [0, 15, 18 + h / 2 * Math.sin(radians(d.tilt))] as Vec3 };
  const assembled = (g: Geom3) => transforms.translate(assembly.position, transforms.rotateX(assembly.rotationX, g));
  const plateThickness = wall * 2.5, plateZ = d.depth + wall + d.clearance + plateThickness / 2;
  const backPlate = booleans.subtract(roundedBox([mountX * 2 + 18, mountY * 2 + 18, plateThickness], [0, 0, plateZ]), ...fastening.map(([x, y]) => cylinder(1.7, plateThickness + 2, [x, y, plateZ])));
  const postY = 15 + ((wall * 2 - assembly.position[2]) * Math.cos(radians(d.tilt)) - plateZ) / Math.sin(radians(d.tilt)) - 14;
  const baseWidth = Math.max(104, w - 4), baseDepth = Math.max(110, Math.abs(postY) + 32), baseCenterY = postY / 2;
  const foot = roundedBox([baseWidth, baseDepth, wall * 2], [0, baseCenterY, wall], 10);
  const post = modeling.hulls.hull(roundedBox([44, 20, wall * 2], [0, postY, wall]), assembled(box([44, wall * 2, wall * 2], [0, -mountY + 4, plateZ])));
  const cableTunnel = transforms.rotateX(Math.PI / 2, cylinder(7, baseDepth + 20, [0, 0, 0]));
  let base = booleans.union(foot, post, assembled(backPlate));
  // Keep screw passages clear even where the pedestal spine joins the plate.
  base = booleans.subtract(base, ...fastening.map(([x, y]) => assembled(cylinder(1.7, plateThickness + 20, [x, y, plateZ]))), transforms.translate([0, postY, wall * 2 + 14], cableTunnel), ...[-baseWidth / 2 + 12, baseWidth / 2 - 12].flatMap(x => [-baseDepth / 2 + 12, baseDepth / 2 - 12].map(y => cylinder(2.1, wall * 2 + 2, [x, y + baseCenterY, wall]))));
  const parts = ([['frame', frame], ['body', body], ['lid', lid], ['base', base]] as const).map(([name, geometry]): PrintPart => {
    const dimensions = measurements.measureDimensions(geometry) as Vec3;
    const fitsBed = dimensions[2] <= d.bed[2] && ((dimensions[0] <= d.bed[0] && dimensions[1] <= d.bed[1]) || (dimensions[1] <= d.bed[0] && dimensions[0] <= d.bed[1]));
    if (!fitsBed) issues.push({ kind: 'bed', message: `${name}: ${dimensions.map(n => n.toFixed(1)).join(' × ')} mm เกินเตียงพิมพ์` });
    return { name, geometry, dimensions, fitsBed };
  });
  const solidOverlap = (a: Geom3, b: Geom3) => overlap(bounds(a), bounds(b)) && Math.abs(measurements.measureVolume(booleans.intersect(a, b))) > 0.001;
  const caseParts = parts.filter(p => p.name !== 'base');
  for (let i = 0; i < caseParts.length; i++) for (let j = i + 1; j < caseParts.length; j++) {
    if (solidOverlap(caseParts[i].geometry, caseParts[j].geometry)) issues.push({ kind: 'collision', message: `${caseParts[i].name} ชนชิ้นพิมพ์ ${caseParts[j].name}: ปรับผนัง/ระยะเผื่อก่อนประกอบ` });
  }
  for (const electronic of electronics) for (const part of parts.filter(p => p.name !== 'base')) if (solidOverlap(electronic.geometry, part.geometry)) issues.push({ kind: 'collision', message: `${electronic.name} ชนเนื้อพลาสติก ${part.name}` });
  for (const part of parts.filter(p => p.name !== 'base')) {
    const placed = transforms.translate(assembly.position, transforms.rotateX(assembly.rotationX, part.geometry));
    if (solidOverlap(placed, base)) issues.push({ kind: 'collision', message: `${part.name} ชนฐานในตำแหน่งประกอบ` });
  }
  return { parts, electronics, cables, wires, mountingPosts, issues, assembly };
}
export function exportPartStl(part: PrintPart): Uint8Array {
  const oriented = part.name === 'lid' ? transforms.rotateX(Math.PI, part.geometry) : part.geometry;
  const minimum = bounds(oriented)[0];
  const onBed = transforms.translate(minimum.map(v => -v) as Vec3, oriented);
  // JSCAD's fixed T-junction tolerance needs normalized units; restore mm in the emitted STL.
  const chunks = stlSerializer.serialize({ binary: true }, transforms.scale([0.001, 0.001, 0.001], onBed)) as Array<ArrayBuffer | Uint8Array>;
  const arrays = chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c));
  const result = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const chunk of arrays) { result.set(chunk, offset); offset += chunk.length; }
  const data = new DataView(result.buffer);
  for (let triangle = 84; triangle < result.length; triangle += 50) for (let vertex = 0; vertex < 9; vertex++) {
    const coordinate = triangle + 12 + vertex * 4;
    data.setFloat32(coordinate, data.getFloat32(coordinate, true) * 1000, true);
  }
  return result;
}
export const BUILD_NOTES = `POS Café Maker — พิมพ์เขียวต้นแบบ

STL เป็นชิ้นงานจริงที่สร้างจากตัวเลขใน design.json ไม่ใช่อุปกรณ์ที่ทดสอบประกอบแล้ว
ขนาดจอเริ่มต้นอ้างอิง Waveshare 7inch HDMI LCD (C): https://www.waveshare.com/wiki/7inch_HDMI_LCD_(C)
ใช้พื้นที่แสดงผลกึ่งกลางเป็นสมมติฐาน ต้องวัดแนวกรอบ พอร์ตและส่วนที่ยึดได้ของโมดูลจริง
ค่า SBC MCU พัดลม และช่องพอร์ตเป็นแม่แบบสมมติ ไม่ใช่สเปกสินค้ารุ่นใด
PCB accessory มี sourceFile/sourceHash อ้างอิงแบบ KiCad; ขอบบอร์ด รู และ net มาจากแบบ ส่วน envelope เป็นพื้นที่เผื่อตามการออกแบบ ไม่ใช่การวัดชิ้นส่วนจริง
หากแก้ขนาดในเว็บ sourceHash ยังคงอ้างอิง PCB ต้นทาง ไม่ยืนยันว่าค่าที่แก้ตรงกับ PCB
วัดจอ บอร์ด รูยึด หัวปลั๊ก ขาอุปกรณ์ และระยะงอสายจริง แล้วบันทึก JSON ฉบับของคุณ
เติม connector/pinout จาก datasheet ของอุปกรณ์ที่เลือกก่อนสร้างผังสาย ห้ามใช้ภาพ net แทนการตรวจวงจร
ยังไม่ได้พิมพ์/ผลิต PCB/ประกอบ/ทดสอบโหลด ความร้อน กลับขั้ว หรือยืนยัน G-code ด้วย slicer
ฐานด้านหลังขันยึดกับฝาด้วยสกรู M3 และน็อต 4 ชุด ลายรูเริ่มต้น80x50mm ตรวจความยาวสกรูไม่ให้ชนบอร์ด
ฝามีตัวประคองขอบหลังจอ เว้นระยะตาม clearance ต้องวัดพื้นที่ที่กดได้และใช้วัสดุรองตามอุปกรณ์จริง ห้ามกดกระจกหรือ PCB โดยไม่ตรวจ
ฐานแท่นด้านหลังและอุโมงค์สายอาจต้องใช้ support ตามแนวพิมพ์; ตรวจ STL ใน slicer ทดสอบชิ้นส่วนและวงจรจริงก่อนผลิตซ้ำหรือใช้ในร้าน
คู่มือ: https://github.com/boombignose/pos-cafe-maker/blob/main/docs/BLUEPRINT.md
`;
export function exportDesignZip(design: Design): Uint8Array {
  const d = parseDesign(design), model = generateModel(d);
  return zipSync(Object.fromEntries([...model.parts.map(p => [`${p.name}.stl`, exportPartStl(p)] as const), ['design.json', strToU8(JSON.stringify(d, null, 2))], ['BUILD-NOTES.txt', strToU8(BUILD_NOTES)]]));
}
export function triangles(geometry: Geom3): Float32Array {
  const positions: number[] = [];
  for (const polygon of geometries.geom3.toPolygons(geometry)) {
    for (let i = 1; i < polygon.vertices.length - 1; i++) for (const point of [polygon.vertices[0], polygon.vertices[i], polygon.vertices[i + 1]]) positions.push(...point);
  }
  return new Float32Array(positions);
}
