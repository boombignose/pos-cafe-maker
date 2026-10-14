declare module '@jscad/stl-serializer' {
  import type { Geom3 } from '@jscad/modeling/src/geometries/types.js';
  const serializer: { serialize(options: { binary: boolean }, ...objects: Geom3[]): (ArrayBuffer | Uint8Array)[] };
  export default serializer;
}
