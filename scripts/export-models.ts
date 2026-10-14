import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultDesign, exportDesignZip, exportPartStl, generateModel, parseBoardManifest, parseDesign, replaceAccessory } from '../src/designer/model.js';

async function main() {
  const args = process.argv.slice(2);
  let design = defaultDesign();
  let output = path.resolve('examples/models');
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value) throw new Error(`Missing value after ${args[i]}`);
    if (args[i] === '--design') design = parseDesign(await readFile(value, 'utf8'));
    else if (args[i] === '--board') design = replaceAccessory(design, parseBoardManifest(await readFile(value, 'utf8')));
    else if (args[i] === '--out') output = path.resolve(value);
    else throw new Error(`Unknown option ${args[i]}; use --design <JSON>, --board <manifest JSON>, --out <directory>`);
  }
  const model = generateModel(design);
  await mkdir(output, { recursive: true });
  for (const part of model.parts) await writeFile(path.join(output, `${part.name}.stl`), exportPartStl(part));
  await writeFile(path.join(output, 'design.json'), JSON.stringify(design, null, 2) + '\n');
  await writeFile(path.join(output, 'pos-cafe-models.zip'), exportDesignZip(design));
  const report = { units: 'mm', prototype: true, physicalValidation: false, parts: model.parts.map(({ name, dimensions, fitsBed }) => ({ name, dimensions, fitsBed })), mountingPosts: model.mountingPosts, issues: model.issues };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Generated 4 binary STL files, design.json, ZIP and report.json in ${output}`);
  console.log(model.issues.length ? `Warnings (${model.issues.length}):\n${model.issues.map(i => i.message).join('\n')}` : 'No envelope collisions; all print parts fit the configured bed. Physical prototype checks still required.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
