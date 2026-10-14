import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { triangles, type Design, type Model } from './model';

type View = 'assembled' | 'exploded' | 'transparent';
export default function Preview({ model, design, view, wiring }: { model: Model; design: Design; view: View; wiring: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); setError(''); }
    catch { setError('อุปกรณ์นี้เปิด WebGL ไม่ได้ ยังปรับขนาดและ export STL / JSON ได้'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'โมเดลสามมิติ หมุนด้วยเมาส์ ลากสองนิ้วหรือเมาส์ขวาเพื่อเลื่อน ใช้ล้อเมาส์เพื่อซูม');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7edf2');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 3000);
    camera.up.set(0, 0, 1);
    const maxDimension = Math.max(design.screen.width, design.screen.height, design.depth);
    camera.position.set(maxDimension * 1.35, maxDimension * 1.8, maxDimension * 1.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, design.screen.height * 0.45);
    controls.enableDamping = true;
    const ambient = new THREE.HemisphereLight('#ffffff', '#657585', 2.5);
    scene.add(ambient);
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(100, -150, 250); scene.add(light);
    const assembly = new THREE.Group();
    assembly.rotation.x = model.assembly.rotationX;
    assembly.position.set(...model.assembly.position);
    scene.add(assembly);
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    function mesh(raw: Float32Array, color: string, opacity: number) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(raw, 3)); geo.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.06, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });
      geometries.push(geo); materials.push(material);
      return new THREE.Mesh(geo, material);
    }
    model.parts.forEach((part, i) => {
      const obj = mesh(triangles(part.geometry), ['#e7e1d4', '#283f36', '#617267', '#283f36'][i], view === 'transparent' && part.name !== 'base' ? 0.22 : 1);
      if (part.name === 'base') scene.add(obj);
      else {
        if (view === 'exploded') obj.position.z = part.name === 'frame' ? -32 : part.name === 'lid' ? 42 : 0;
        assembly.add(obj);
      }
    });
    model.electronics.forEach(e => {
      const obj = mesh(triangles(e.geometry), e.color, 1);
      if (view === 'exploded') obj.position.z = e.kind === 'screen' ? -16 : 12;
      assembly.add(obj);
    });
    if (wiring) {
      model.cables.forEach(c => { const obj = mesh(triangles(c.geometry), '#248fc3', 0.13); assembly.add(obj); });
      model.wires.forEach(w => {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...w.from), new THREE.Vector3(...w.to)]);
        const material = new THREE.LineBasicMaterial({ color: w.net.toUpperCase().includes('GND') ? '#202834' : w.net.includes('5') ? '#df4646' : '#3c7dec' });
        geometries.push(geo); materials.push(material); assembly.add(new THREE.Line(geo, material));
      });
    }
    const grid = new THREE.GridHelper(350, 35, '#adb8c1', '#c9d3da'); grid.rotation.x = Math.PI / 2; grid.position.z = -0.4; scene.add(grid);
    const axes = new THREE.AxesHelper(35); axes.position.set(-100, -75, 0); scene.add(axes);
    const observer = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    }); observer.observe(element);
    let animation = 0;
    const draw = () => { animation = requestAnimationFrame(draw); controls.update(); renderer.render(scene, camera); }; draw();
    return () => { cancelAnimationFrame(animation); observer.disconnect(); controls.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); renderer.dispose(); element.removeChild(renderer.domElement); };
  }, [model, design, view, wiring]);
  return <div className="designer-preview" ref={host}>{error && <p role="status">{error}</p>}</div>;
}
