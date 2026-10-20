export function createStressGLB(segments = 200, rings = 150) {
  if (!Number.isInteger(segments) || !Number.isInteger(rings) || segments < 3 || rings < 2 || segments * rings > 40_000) throw new Error('压力模型最多生成 8 万个三角形。');
  const count = (segments + 1) * (rings + 1);
  const positions = Buffer.alloc(count * 12);
  const normals = Buffer.alloc(count * 12);
  const indices = Buffer.alloc(segments * rings * 24);
  for (let ring = 0; ring <= rings; ring += 1) {
    const latitude = ring / rings * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const longitude = segment / segments * Math.PI * 2;
      const point = [Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)];
      const offset = (ring * (segments + 1) + segment) * 12;
      for (const [axis, value] of point.entries()) { positions.writeFloatLE(value,offset+axis*4); normals.writeFloatLE(value,offset+axis*4); }
    }
  }
  let indexOffset = 0;
  for (let ring = 0; ring < rings; ring += 1) for (let segment = 0; segment < segments; segment += 1) {
    const first = ring * (segments + 1) + segment;
    const next = first + segments + 1;
    for (const index of [first,first+1,next,next,first+1,next+1]) { indices.writeUInt32LE(index,indexOffset); indexOffset+=4; }
  }
  const binary = Buffer.concat([positions,normals,indices]);
  const document = { asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}], meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}], materials:[{pbrMetallicRoughness:{baseColorFactor:[.45,.65,.4,1],metallicFactor:0,roughnessFactor:.8}}], buffers:[{byteLength:binary.length}], bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length},{buffer:0,byteOffset:positions.length,byteLength:normals.length},{buffer:0,byteOffset:positions.length+normals.length,byteLength:indices.length}], accessors:[{bufferView:0,componentType:5126,count,type:'VEC3',min:[-1,-1,-1],max:[1,1,1]},{bufferView:1,componentType:5126,count,type:'VEC3'},{bufferView:2,componentType:5125,count:indices.length/4,type:'SCALAR'}] };
  const text = Buffer.from(JSON.stringify(document));
  const json = Buffer.alloc(Math.ceil(text.length/4)*4,0x20);
  text.copy(json);
  const result = Buffer.alloc(28+json.length+binary.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);
  result.writeUInt32LE(binary.length,20+json.length);result.writeUInt32LE(0x004e4942,24+json.length);binary.copy(result,28+json.length);
  return result;
}
