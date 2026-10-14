import { useEffect, useMemo, useState } from 'react';
import Preview from './Preview';
import { BOARD_CATALOG, defaultDesign, exportDesignZip, exportPartStl, generateModel, parseBoardManifest, parseDesign, replaceAccessory, type Design, type Module, type Vec3 } from './model';
import './designer.css';

function NumberField({ label, value, onChange, min = 0, max = 300, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);
    else setDraft(String(value));
  };
  return <label className="designer-number">{label}<input type="number" min={min} max={max} step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
}
function download(name: string, bytes: Uint8Array | string, type: string) {
  const data = typeof bytes === 'string' ? bytes : new Uint8Array(bytes).buffer;
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const errorText = (e: unknown) => e instanceof Error ? e.message : 'ไม่สามารถอ่านไฟล์ได้';

export default function Designer() {
  const [design, setDesign] = useState(defaultDesign);
  const [view, setView] = useState<'assembled' | 'exploded' | 'transparent'>('transparent');
  const [wiring, setWiring] = useState(true), [selected, setSelected] = useState('sbc');
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [holesDraft, setHolesDraft] = useState('');
  const result = useMemo(() => { try { return { model: generateModel(design), error: '' }; } catch (e) { return { model: undefined, error: errorText(e) }; } }, [design]);
  const selectedModule = design.modules.find(m => m.id === selected);
  useEffect(() => { setHolesDraft(selectedModule?.holes.map(h => `${h.x}, ${h.y}, ${h.diameter}`).join('\n') ?? ''); }, [selectedModule]);
  function change(next: Design) {
    try { const parsed = parseDesign(next); setDesign(parsed); setError(''); setMessage('ปรับโมเดลแล้ว'); }
    catch (e) { setError(errorText(e)); }
  }
  function moduleChange(patch: Partial<Module>) {
    change({ ...design, modules: design.modules.map(m => m.id === selected ? { ...m, ...patch } : m) });
  }
  async function importFile(file: File | undefined, kind: 'design' | 'board') {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error('ไฟล์ใหญ่เกิน 1 MB');
      const content = await file.text();
      const next = kind === 'design' ? parseDesign(content) : replaceAccessory(design, parseBoardManifest(content));
      setDesign(next); setSelected(kind === 'board' ? 'accessory' : next.modules[0]?.id ?? ''); setError('');
      setMessage(kind === 'board' ? 'นำเข้า PCB แล้ว เสายึดสร้างใหม่จากรูใน manifest' : 'โหลดแบบเรียบร้อย');
    } catch (e) { setError(errorText(e)); }
  }
  function updateHoles() {
    try {
      const holes = holesDraft.trim() ? holesDraft.trim().split('\n').map(line => {
        const values = line.split(',').map(v => Number(v.trim()));
        if (values.length !== 3 || values.some(v => !Number.isFinite(v))) throw new Error('แต่ละบรรทัดต้องเป็น x, y, diameter เช่น 4, 4, 3.2');
        return { x: values[0], y: values[1], diameter: values[2] };
      }) : [];
      moduleChange({ holes });
    } catch (e) { setError(errorText(e)); }
  }
  const screenFields: [keyof Design['screen'], string][] = [['width', 'ขอบนอก กว้าง'], ['height', 'ขอบนอก สูง'], ['activeWidth', 'พื้นที่แสดงผล กว้าง'], ['activeHeight', 'พื้นที่แสดงผล สูง'], ['thickness', 'ความหนาจอ']];
  const model = result.model;
  return <section className="designer" aria-label="ออกแบบกล่อง POS">
    <div className="designer-heading"><div><p className="designer-eyebrow">DESIGN / PRINT / BUILD</p><h2>กล่องที่พอดีกับเครื่องคุณ</h2><p>ปรับเป็นมิลลิเมตร ดูตำแหน่งอุปกรณ์ แล้วส่งออก 4 ชิ้นสำหรับพิมพ์</p></div><span className="designer-prototype">PROTOTYPE · ยังไม่ทดสอบชิ้นงานจริง</span></div>
    <div className="designer-layout">
      <aside className="designer-controls">
        <details open><summary>01 · จอและกล่อง <span>mm</span></summary><div className="designer-fields">
          {screenFields.map(([key, label]) => <NumberField key={key} label={label} value={design.screen[key]} min={key === 'width' ? 60 : key === 'height' ? 45 : key === 'thickness' ? 1 : 0.1} max={key === 'thickness' ? 30 : 300} onChange={n => change({ ...design, screen: { ...design.screen, [key]: n } })} />)}
          <NumberField label="ความลึกกล่อง" value={design.depth} min={25} max={160} onChange={n => change({ ...design, depth: n })} />
          <NumberField label="ผนัง" value={design.wall} min={1.2} max={6} onChange={n => change({ ...design, wall: n })} />
          <NumberField label="ระยะเผื่อ" value={design.clearance} min={0} max={2} onChange={n => change({ ...design, clearance: n })} />
          <NumberField label="มุมฐาน (°)" value={design.tilt} min={30} max={75} onChange={n => change({ ...design, tilt: n })} />
          <NumberField label="พื้นที่เสียบ / งอสาย" value={design.cableClearance} min={3} max={200} onChange={n => change({ ...design, cableClearance: n })} />
        </div></details>
        <details open><summary>02 · อุปกรณ์และรูยึด</summary><label>เลือกอุปกรณ์<select value={selected} onChange={e => setSelected(e.target.value)}><option value="" disabled>เลือกอุปกรณ์</option>{design.modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          {selectedModule && <><div className="designer-fields">{(['width', 'height', 'thickness'] as const).map((key, i) => <NumberField key={key} label={['กว้าง', 'สูง', 'ความหนา'][i]} value={selectedModule[key]} min={key === 'thickness' ? 0.5 : 1} max={key === 'thickness' ? 30 : 300} onChange={n => moduleChange({ [key]: n })} />)}
            {(['X', 'Y', 'Z'] as const).map((axis, i) => <NumberField key={axis} label={`ตำแหน่ง ${axis}`} value={selectedModule.position[i]} min={i === 2 ? 0 : -500} max={500} onChange={n => { const p = [...selectedModule.position] as Vec3; p[i] = n; moduleChange({ position: p }); }} />)}
            <NumberField label="หมุนในระนาบ PCB (°)" value={selectedModule.rotation} min={-360} max={360} onChange={n => moduleChange({ rotation: n })} />
          </div><label>รูยึด x, y, diameter (จุดเริ่มมุมซ้ายล่าง)<textarea value={holesDraft} onChange={e => setHolesDraft(e.target.value)} rows={4} spellCheck={false} /></label><div className="designer-inline"><button onClick={updateHoles}>ใช้รูยึดนี้</button><button className="designer-danger" onClick={() => { const remaining = design.modules.filter(m => m.id !== selected); change({ ...design, modules: remaining }); setSelected(remaining[0]?.id ?? ''); }}>นำอุปกรณ์ออก</button></div></>}
          <label className="designer-upload">นำเข้า PCB manifest JSON<input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0], 'board'); e.target.value = ''; }} /></label>
          <p className="designer-hint">รองรับ hardware/board.json · รูและความสูงจากไฟล์จะสร้างเสายึดใหม่</p>
        </details>
        <details><summary>03 · ช่องพอร์ต</summary>{design.ports.map((p, index) => {
          const patch = (changePort: Partial<Design['ports'][number]>) => change({ ...design, ports: design.ports.map((port, i) => i === index ? { ...port, ...changePort } : port) });
          return <div className="designer-port" key={p.id}><strong>{p.name}</strong><label>ด้าน<select value={p.face} onChange={e => patch({ face: e.target.value as typeof p.face })}><option value="left">ซ้าย</option><option value="right">ขวา</option><option value="top">บน</option><option value="bottom">ล่าง</option></select></label><div className="designer-fields"><NumberField label="เลื่อนตามขอบ" value={p.offset} min={-140} max={140} onChange={n => patch({ offset: n })} /><NumberField label="ตำแหน่ง Z" value={p.z} max={160} onChange={n => patch({ z: n })} /><NumberField label="กว้าง" value={p.width} min={2} max={70} onChange={n => patch({ width: n })} /><NumberField label="สูง" value={p.height} min={2} max={50} onChange={n => patch({ height: n })} /></div><button onClick={() => change({ ...design, ports: design.ports.filter(port => port.id !== p.id) })}>ลบช่องนี้</button></div>;
        })}<button onClick={() => change({ ...design, ports: [...design.ports, { id: `port-${Date.now()}`, name: 'ช่องพอร์ตเพิ่มเติม', face: 'right', offset: 25, z: 25, width: 12, height: 8 }] })}>+ เพิ่มช่องพอร์ต</button></details>
        <details><summary>04 · เตียงพิมพ์</summary><div className="designer-fields">{['X', 'Y', 'Z'].map((axis, i) => <NumberField key={axis} label={`เตียง ${axis}`} value={design.bed[i]} min={1} max={300} onChange={n => { const bed = [...design.bed] as Vec3; bed[i] = n; change({ ...design, bed }); }} />)}</div></details>
      </aside>
      <div className="designer-workspace">
        <div className="designer-toolbar"><div className="designer-modes" aria-label="มุมมองโมเดล">{([['assembled', 'ประกอบ'], ['exploded', 'แยกชิ้น'], ['transparent', 'โปร่งใส']] as const).map(([value, label]) => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>)}</div><label className="designer-checkbox"><input type="checkbox" checked={wiring} onChange={e => setWiring(e.target.checked)} />สายและระยะเสียบ</label></div>
        {model ? <Preview model={model} design={design} view={view} wiring={wiring} /> : <div className="designer-preview-error" role="alert">{result.error}</div>}
        <div className="designer-preview-caption"><span>ลากเพื่อหมุน · ล้อเมาส์ซูม · คลิกขวาเลื่อน</span><span>จอ {design.screen.width} × {design.screen.height} mm · {design.tilt}°</span></div>
        <div aria-live="polite" className="designer-messages">{error && <p role="alert" className="designer-error">{error}</p>}{message && !error && <p className="designer-success">{message}</p>}</div>
        <div className="designer-export"><div><h3>พร้อมส่งเข้า slicer</h3><p>STL หน่วย mm · วางชิ้นงานบน Z=0 · ไม่มีอุปกรณ์อิเล็กทรอนิกส์ในไฟล์พิมพ์</p></div><div className="designer-inline"><button className="designer-primary" disabled={!model} onClick={() => { try { download('pos-cafe-models.zip', exportDesignZip(design), 'application/zip'); setMessage('ดาวน์โหลด ZIP: 4 STL และ design.json'); } catch (e) { setError(errorText(e)); } }}>ดาวน์โหลด STL ทั้งชุด (ZIP)</button><button onClick={() => download('design.json', JSON.stringify(design, null, 2), 'application/json')}>บันทึก JSON</button><label className="designer-upload">โหลดแบบ JSON<input type="file" accept=".json,application/json" onChange={e => { void importFile(e.target.files?.[0], 'design'); e.target.value = ''; }} /></label></div></div>
        {model && <><div className="designer-part-grid">{model.parts.map(p => <div className="designer-part" key={p.name}><strong>{({ frame: 'กรอบจอ', body: 'ตัวกล่อง', lid: 'ฝาหลัง + เสายึด', base: 'ฐานเอียง' })[p.name]}</strong><span>{p.dimensions.map(n => n.toFixed(1)).join(' × ')} mm</span><span className={p.fitsBed ? 'designer-success' : 'designer-error'}>{p.fitsBed ? '✓ อยู่ในเตียงพิมพ์' : '⚠ เกินเตียงพิมพ์'}</span><button onClick={() => download(`${p.name}.stl`, exportPartStl(p), 'application/sla')}>{p.name}.stl ↓</button></div>)}</div>
          <div className="designer-checks"><h3>ตรวจระยะ <span>{model.mountingPosts.length} เสายึด</span></h3>{model.issues.length ? <ul>{model.issues.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul> : <p className="designer-success">✓ ไม่พบการชนจาก envelope ที่ตั้งไว้ · ชิ้นส่วนอยู่ในเตียงพิมพ์</p>}<p className="designer-hint">ตรวจด้วยกรอบครอบอุปกรณ์ จึงอาจแจ้งเตือนเมื่อหมุนชิ้นงานเฉียง ต้องยืนยันรูจริง ทิศสาย การยึดจอ และการระบายความร้อนก่อนใช้งาน</p></div></>}
      </div>
    </div>
    <div className="designer-bottom-grid"><div><h3>คลังอุปกรณ์อ้างอิง</h3><div className="designer-catalog">{BOARD_CATALOG.map(item => <div key={item.id}><strong>{item.board.name}</strong><p>{item.description}</p><button disabled={design.modules.length >= 16} onClick={() => { const id = `${item.id}-${Date.now()}`; change({ ...design, modules: [...design.modules, { ...structuredClone(item.board), id, kind: item.id === 'fan' ? 'fan' : 'board', position: [0, 0, 28], rotation: 0 }] }); setSelected(id); }}>+ เพิ่มอุปกรณ์</button></div>)}</div></div><div><h3>ผังสายและรายการ connector</h3><p className="designer-hint">เส้นเชื่อมใช้ net ชื่อเดียวกันเป็นเพียงภาพอ้างอิง ตรวจแรงดันและ pinout จริงตาม docs/HARDWARE.md</p><div className="designer-wiring">{design.modules.flatMap(m => m.connectors.map(c => <div key={`${m.id}/${c.id}`}><strong>{m.name} / {c.name}</strong><span>{c.type}</span><p>{c.pins.map(p => `${p.name} → ${p.net}${p.voltage !== undefined ? ` (${p.voltage} V)` : ''}`).join(' · ')}</p></div>))}</div></div></div>
  </section>;
}
