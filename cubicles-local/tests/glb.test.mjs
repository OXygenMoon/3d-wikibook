import test from 'node:test'
import assert from 'node:assert/strict'
import { validateGLB } from '../lib/validate-glb.mjs'

function model() {
  return {
    asset: { version: '2.0', generator: '本地测试' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  }
}
function glb(json = model(), binary = Buffer.alloc(36)) {
  const encoded = Buffer.from(JSON.stringify(json))
  const payload = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20)
  encoded.copy(payload)
  const bin = binary === null ? null : Buffer.alloc(Math.ceil(binary.length / 4) * 4)
  binary?.copy(bin)
  const output = Buffer.alloc(12 + 8 + payload.length + (bin ? 8 + bin.length : 0))
  output.writeUInt32LE(0x46546c67, 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(payload.length, 12)
  output.writeUInt32LE(0x4e4f534a, 16)
  payload.copy(output, 20)
  if (bin) {
    const offset = 20 + payload.length
    output.writeUInt32LE(bin.length, offset)
    output.writeUInt32LE(0x004e4942, offset + 4)
    bin.copy(output, offset + 8)
  }
  return output
}
function invalid(buffer, pattern, status = 400) {
  assert.throws(() => validateGLB(buffer), error => error.status === status && pattern.test(error.message))
}

test('接受自包含 GLB 2.0 三角形并返回统计', () => {
  const input = glb()
  assert.deepEqual(validateGLB(input), { meshCount: 1, nodeCount: 1, triangleCount: 1, bytes: input.length })
  assert.equal(validateGLB(new Uint8Array(input)).triangleCount, 1)
})
test('接受常规内嵌纹理、材质与 data URI 缓冲区', () => {
  const json = model()
  json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]
  json.textures = [{ source: 0 }]
  json.images = [{ uri: 'data:image/png;base64,aGVsbG8=' }]
  json.meshes[0].primitives[0].material = 0
  assert.equal(validateGLB(glb(json)).meshCount, 1)
  json.buffers[0].uri = `data:application/octet-stream;base64,${Buffer.alloc(36).toString('base64')}`
  assert.equal(validateGLB(glb(json, null)).nodeCount, 1)
  delete json.buffers[0].uri
  json.images = [{ bufferView: 1, mimeType: 'image/png' }]
  json.bufferViews.push({ buffer: 0, byteOffset: 36, byteLength: 4 })
  json.buffers[0].byteLength = 40
  assert.equal(validateGLB(glb(json, Buffer.alloc(40))).meshCount, 1)
})
test('拒绝错误文件头、版本、声明长度及损坏数据块', () => {
  invalid(Buffer.alloc(10), /文件头/)
  let input = glb(); input.writeUInt32LE(0, 0); invalid(input, /不是有效/)
  input = glb(); input.writeUInt32LE(1, 4); invalid(input, /2.0/)
  input = glb(); input.writeUInt32LE(input.length - 1, 8); invalid(input, /声明长度/)
  input = glb(); input.writeUInt32LE(1, 12); invalid(input, /数据块长度/)
  input = glb(); input.writeUInt32LE(0xffffffff, 12); invalid(input, /数据块长度/)
  input = glb(); input.writeUInt32LE(0x004e4942, 16); invalid(input, /首个数据块/)
  input = glb(); input[20] = 0; invalid(input, /JSON/)
})
test('拒绝外部资源，包括扩展中的嵌套 URI', () => {
  const json = model()
  json.images = [{ uri: 'https://example.com/texture.png' }]
  invalid(glb(json), /外部文件/)
  json.images = [{ uri: '../texture.png' }]
  invalid(glb(json), /外部文件/)
  delete json.images
  json.extensions = { TEST_payload: { nested: [{ uri: 'file:///etc/passwd' }] } }
  invalid(glb(json), /外部文件/)
})
test('拒绝当前运行时没有解码器的压缩模型', () => {
  for (const name of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) {
    const json = model(); json.extensionsUsed = [name]
    invalid(glb(json), /不支持.*压缩/)
    delete json.extensionsUsed
    json.meshes[0].primitives[0].extensions = { [name]: {} }
    invalid(glb(json), /不支持.*压缩/)
  }
  const json = model(); json.images = [{ bufferView: 0, mimeType: 'image/ktx2' }]
  invalid(glb(json), /KTX2/)
  json.images = [{ uri: 'data:image/ktx2;base64,aGVsbG8=' }]
  invalid(glb(json), /KTX2/)
})
test('验证缓冲视图、顶点范围、节点与场景引用并拒绝循环', () => {
  const variants = [
    [json => { json.bufferViews[0].byteLength = 40 }, /超出二进制/],
    [json => { json.accessors[0].count = 4 }, /超出缓冲/],
    [json => { json.nodes[0].mesh = 2 }, /节点网格引用/],
    [json => { json.nodes[0].children = [1] }, /子节点引用/],
    [json => { json.scenes[0].nodes = [2] }, /场景根节点引用/],
    [json => { json.scene = 1 }, /默认场景引用/],
    [json => { json.nodes[0].children = [0] }, /循环引用/],
    [json => { json.nodes.push({ children: [0] }); json.nodes[0].children = [1] }, /循环引用/],
  ]
  for (const [mutate, pattern] of variants) {
    const json = model(); mutate(json); invalid(glb(json), pattern)
  }
})
test('拒绝空模型、没有位置数据或不可见的场景', () => {
  let json = model(); json.meshes = []; invalid(glb(json), /模型为空/)
  json = model(); json.meshes[0].primitives = []; invalid(glb(json), /空网格/)
  json = model(); delete json.meshes[0].primitives[0].attributes.POSITION; invalid(glb(json), /位置数据/)
  json = model(); json.scenes[0].nodes = []; invalid(glb(json), /没有可显示/)
  json = model(); delete json.scenes; invalid(glb(json), /没有可显示/)
})
test('20 MiB 上限包含边界，超限返回 413', () => {
  const json = model()
  // Metadata pads the JSON chunk to precisely the public file-size ceiling.
  const base = glb(json).length
  json.extras = { padding: '' }
  const overhead = glb(json).length - base
  json.extras.padding = 'x'.repeat(20 * 1024 * 1024 - base - overhead)
  const boundary = glb(json)
  assert.equal(boundary.length, 20 * 1024 * 1024)
  assert.equal(validateGLB(boundary).bytes, boundary.length)
  invalid(Buffer.alloc(20 * 1024 * 1024 + 1), /20 MiB/, 413)
})
test('限制节点、位置顶点和三角形，深层无环节点可正常读取', () => {
  const json = model()
  json.nodes = Array.from({ length: 2000 }, (_, i) => i === 1999 ? { mesh: 0 } : { children: [i + 1] })
  assert.equal(validateGLB(glb(json)).nodeCount, 2000)
  json.nodes.push({})
  invalid(glb(json), /2000/, 413)
  const many = model()
  many.meshes[0].primitives = Array.from({ length: 166667 }, () => ({ attributes: { POSITION: 0 } }))
  invalid(glb(many), /50 万/, 413)
  const triangles = model()
  triangles.accessors.push({ componentType: 5125, count: 900000, type: 'SCALAR' })
  triangles.meshes[0].primitives[0].indices = 1
  triangles.meshes[0].primitives[0].mode = 5
  invalid(glb(triangles), /30 万/, 413)
  triangles.accessors[1].count = 900001
  invalid(glb(triangles), /90 万/, 413)
})
