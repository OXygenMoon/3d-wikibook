const MAX_BYTES = 20 * 1024 * 1024
const MAX_NODES = 2000
const MAX_VERTICES = 500_000
const MAX_TRIANGLES = 300_000
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

const identityMatrix = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function multiplyMatrix(a, b) {
  const out = new Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3]
    }
  }
  return out
}
function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16 && node.matrix.every(Number.isFinite)) return node.matrix
  const [tx, ty, tz] = Array.isArray(node.translation) ? node.translation : [0, 0, 0]
  const [qx, qy, qz, qw] = Array.isArray(node.rotation) ? node.rotation : [0, 0, 0, 1]
  const [sx, sy, sz] = Array.isArray(node.scale) ? node.scale : [1, 1, 1]
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz
  const xx = qx * x2, xy = qx * y2, xz = qx * z2
  const yy = qy * y2, yz = qy * z2, zz = qz * z2
  const wx = qw * x2, wy = qw * y2, wz = qw * z2
  const m00 = 1 - (yy + zz), m01 = xy - wz, m02 = xz + wy
  const m10 = xy + wz, m11 = 1 - (xx + zz), m12 = yz - wx
  const m20 = xz - wy, m21 = yz + wx, m22 = 1 - (xx + yy)
  if (![m00, m01, m02, m10, m11, m12, m20, m21, m22, tx, ty, tz, sx, sy, sz].every(Number.isFinite)) return identityMatrix()
  return [
    m00 * sx, m10 * sx, m20 * sx, 0,
    m01 * sy, m11 * sy, m21 * sy, 0,
    m02 * sz, m12 * sz, m22 * sz, 0,
    tx, ty, tz, 1,
  ]
}
function transformPoint(matrix, x, y, z) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  }
}
function sceneBounds(json, accessors, nodes, scenes, sceneIndex) {
  const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity }
  const stack = (scenes[sceneIndex].nodes ?? []).map(index => ({ index, matrix: identityMatrix() }))
  while (stack.length) {
    const { index, matrix } = stack.pop()
    const node = nodes[index]
    const world = multiplyMatrix(matrix, nodeMatrix(node))
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = accessors[primitive.attributes.POSITION]
        if (!Array.isArray(accessor.min) || !Array.isArray(accessor.max) || accessor.min.length !== 3 || accessor.max.length !== 3) continue
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) {
              const point = transformPoint(world, x, y, z)
              if (![point.x, point.y, point.z].every(Number.isFinite)) continue
              bounds.minX = Math.min(bounds.minX, point.x)
              bounds.minY = Math.min(bounds.minY, point.y)
              bounds.minZ = Math.min(bounds.minZ, point.z)
              bounds.maxX = Math.max(bounds.maxX, point.x)
              bounds.maxY = Math.max(bounds.maxY, point.y)
              bounds.maxZ = Math.max(bounds.maxZ, point.z)
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) stack.push({ index: child, matrix: world })
  }
  if (!Number.isFinite(bounds.minX)) return null
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const depth = bounds.maxZ - bounds.minZ
  return {
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
    depth: Number(depth.toFixed(4)),
    min: [Number(bounds.minX.toFixed(4)), Number(bounds.minY.toFixed(4)), Number(bounds.minZ.toFixed(4))],
    max: [Number(bounds.maxX.toFixed(4)), Number(bounds.maxY.toFixed(4)), Number(bounds.maxZ.toFixed(4))],
  }
}

const compressedExtensions = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'])
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const typeComponents = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

function fail(message, status = 400) {
  const error = new Error(message)
  error.status = status
  throw error
}
function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(`${name}无效。`)
  return value
}
function array(value, name) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${name}必须是数组。`)
  return value
}
function reference(value, list, name) {
  integer(value, name)
  if (value >= list.length) fail(`${name}引用不存在。`)
  return list[value]
}
function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name}格式无效。`)
  return value
}
function embeddedBytes(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:')) fail('模型必须自包含，不能引用外部文件或网址。')
  if (/^data:image\/ktx2[;,]/i.test(uri)) fail('暂不支持 KTX2 压缩纹理，请使用 PNG 或 JPEG。')
  const comma = uri.indexOf(',')
  if (comma < 5) fail('模型中的内嵌资源格式无效。')
  const header = uri.slice(0, comma)
  const body = uri.slice(comma + 1)
  try {
    if (/;base64$/i.test(header)) {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body)) fail('模型中的内嵌资源编码无效。')
      return Buffer.from(body, 'base64').length
    }
    return Buffer.byteLength(decodeURIComponent(body))
  } catch {
    fail('模型中的内嵌资源编码无效。')
  }
}

/** Validate a self-contained glTF 2.0 binary upload without invoking a renderer. */
export function validateGLB(input) {
  if (!(input instanceof Uint8Array)) fail('请上传二进制 GLB 模型文件。')
  const bytes = input.byteLength
  if (bytes > MAX_BYTES) fail('模型文件不能超过 20 MiB。', 413)
  if (bytes < 20) fail('GLB 文件头不完整。')
  const buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (buffer.readUInt32LE(0) !== 0x46546c67) fail('文件不是有效的 GLB 模型。')
  if (buffer.readUInt32LE(4) !== 2) fail('仅支持 GLB 2.0 模型。')
  if (buffer.readUInt32LE(8) !== bytes) fail('GLB 文件声明长度与实际长度不一致。')
  let offset = 12
  let json
  let binaryLength = null
  while (offset < bytes) {
    if (bytes - offset < 8) fail('GLB 数据块头不完整。')
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    if (length % 4 !== 0 || length > bytes - offset - 8) fail('GLB 数据块长度无效。')
    if (offset === 12 && type !== JSON_CHUNK) fail('GLB 的首个数据块必须是 JSON。')
    if (type === JSON_CHUNK) {
      if (json !== undefined) fail('GLB 只能包含一个 JSON 数据块。')
      try {
        json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(offset + 8, offset + 8 + length)))
      } catch { fail('GLB 的 JSON 数据无法解析。') }
    } else if (type === BIN_CHUNK) {
      if (binaryLength !== null) fail('GLB 只能包含一个二进制数据块。')
      binaryLength = length
    } else fail('GLB 包含不支持的数据块，请重新导出标准 GLB 2.0。')
    offset += 8 + length
  }
  object(json, '模型描述')
  if (json.asset?.version !== '2.0' || (json.asset.minVersion !== undefined && json.asset.minVersion !== '2.0')) fail('仅支持 glTF 2.0 格式。')

  // Scan extension payloads as well as core resources; a hidden URI must never fetch a remote file.
  const pending = [json]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    for (const [key, child] of Object.entries(value)) {
      if (key === 'uri') embeddedBytes(child)
      if (key === 'mimeType' && child === 'image/ktx2') fail('暂不支持 KTX2 压缩纹理，请使用 PNG 或 JPEG。')
      if (compressedExtensions.has(key)) fail('暂不支持 Draco、Meshopt 或 KTX2 压缩，请导出未压缩的 GLB。')
      if ((key === 'extensionsUsed' || key === 'extensionsRequired') && Array.isArray(child) && child.some(item => compressedExtensions.has(item))) fail('暂不支持 Draco、Meshopt 或 KTX2 压缩，请导出未压缩的 GLB。')
      if (child && typeof child === 'object') pending.push(child)
    }
  }

  const buffers = array(json.buffers, '缓冲区')
  const views = array(json.bufferViews, '缓冲视图')
  const accessors = array(json.accessors, '顶点数据')
  const meshes = array(json.meshes, '网格')
  const nodes = array(json.nodes, '场景节点')
  const scenes = array(json.scenes, '场景')
  if (nodes.length > MAX_NODES) fail('模型节点不能超过 2000 个。', 413)
  const lengths = buffers.map((item, index) => {
    object(item, '缓冲区')
    const declared = integer(item.byteLength, '缓冲区长度', 1)
    if (item.uri !== undefined) {
      if (embeddedBytes(item.uri) !== declared) fail('内嵌缓冲区长度不一致。')
    } else {
      if (index !== 0 || binaryLength === null || binaryLength < declared || binaryLength - declared > 3) fail('GLB 二进制缓冲区缺失或长度不一致。')
    }
    return declared
  })
  if (binaryLength !== null && !buffers.some(item => item.uri === undefined)) fail('GLB 二进制数据块没有对应的缓冲区。')
  for (const view of views) {
    object(view, '缓冲视图')
    const size = reference(view.buffer, lengths, '缓冲视图的缓冲区')
    const start = integer(view.byteOffset ?? 0, '缓冲视图偏移')
    const length = integer(view.byteLength, '缓冲视图长度', 1)
    if (start + length > size) fail('缓冲视图超出二进制数据范围。')
    if (view.byteStride !== undefined && (integer(view.byteStride, '顶点步长', 4) > 252 || view.byteStride % 4)) fail('顶点步长无效。')
  }
  const checkAccessorRange = (viewIndex, byteOffset, count, elementSize, name, packed = false) => {
    const view = reference(viewIndex, views, `${name}缓冲视图`)
    const stride = packed ? elementSize : (view.byteStride ?? elementSize)
    if (stride < elementSize || byteOffset + (count - 1) * stride + elementSize > view.byteLength) fail(`${name}超出缓冲视图范围。`)
  }
  for (const accessor of accessors) {
    object(accessor, '顶点数据')
    const count = integer(accessor.count, '顶点数据数量', 1)
    // Accessors without a view are legal zero-filled data; bound them before Three allocates arrays.
    if (count > 900_000) fail('模型单组顶点或索引数据不能超过 90 万项。', 413)
    const componentSize = componentBytes[accessor.componentType]
    const components = typeComponents[accessor.type]
    if (!componentSize || !components) fail('顶点数据类型无效。')
    // Matrix columns use 4-byte alignment, including byte/short matrix attributes.
    const columns = accessor.type.startsWith('MAT') ? Number(accessor.type.slice(3)) : 1
    const elementSize = columns > 1 ? Math.ceil(columns * componentSize / 4) * 4 * columns : componentSize * components
    const start = integer(accessor.byteOffset ?? 0, '顶点数据偏移')
    if (accessor.bufferView !== undefined) checkAccessorRange(accessor.bufferView, start, count, elementSize, '顶点数据')
    else if (start !== 0) fail('没有缓冲视图的顶点数据不能设置偏移。')
    if (accessor.sparse !== undefined) {
      const sparse = object(accessor.sparse, '稀疏顶点数据')
      const sparseCount = integer(sparse.count, '稀疏顶点数量', 1)
      if (sparseCount > count) fail('稀疏顶点数量超出范围。')
      object(sparse.indices, '稀疏索引')
      object(sparse.values, '稀疏数据')
      if (![5121, 5123, 5125].includes(sparse.indices.componentType)) fail('稀疏索引类型无效。')
      checkAccessorRange(sparse.indices.bufferView, integer(sparse.indices.byteOffset ?? 0, '稀疏索引偏移'), sparseCount, componentBytes[sparse.indices.componentType], '稀疏索引', true)
      checkAccessorRange(sparse.values.bufferView, integer(sparse.values.byteOffset ?? 0, '稀疏数据偏移'), sparseCount, elementSize, '稀疏数据', true)
    }
  }
  let vertexCount = 0
  let triangleCount = 0
  for (const mesh of meshes) {
    object(mesh, '网格')
    const primitives = array(mesh.primitives, '网格图元')
    if (!primitives.length) fail('模型包含空网格。')
    for (const primitive of primitives) {
      object(primitive, '网格图元')
      object(primitive.attributes, '网格顶点属性')
      const position = reference(primitive.attributes.POSITION, accessors, '网格位置数据')
      if (position.type !== 'VEC3') fail('网格位置数据必须为三维坐标。')
      vertexCount += position.count
      if (vertexCount > MAX_VERTICES) fail('模型总位置顶点不能超过 50 万个。', 413)
      for (const index of Object.values(primitive.attributes)) reference(index, accessors, '网格属性')
      let count = position.count
      if (primitive.indices !== undefined) {
        const indices = reference(primitive.indices, accessors, '网格索引')
        if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType)) fail('网格索引类型无效。')
        count = indices.count
      }
      const mode = integer(primitive.mode ?? 4, '网格图元模式')
      if (mode > 6) fail('网格图元模式无效。')
      if (mode === 4) {
        if (count % 3) fail('三角形顶点或索引数量必须是 3 的倍数。')
        triangleCount += count / 3
      } else if (mode === 5 || mode === 6) triangleCount += Math.max(0, count - 2)
      if (triangleCount > MAX_TRIANGLES) fail('模型三角形不能超过 30 万个。', 413)
    }
  }
  if (!meshes.length || !vertexCount) fail('模型为空，请至少导出一个包含位置顶点的网格。')
  for (const node of nodes) {
    object(node, '场景节点')
    if (node.mesh !== undefined) reference(node.mesh, meshes, '节点网格')
    for (const child of array(node.children, '子节点')) reference(child, nodes, '子节点')
  }
  // An iterative depth-first walk handles deeply nested but valid exports without a stack overflow.
  const colors = new Uint8Array(nodes.length)
  for (let start = 0; start < nodes.length; start++) {
    if (colors[start]) continue
    const stack = [[start, false]]
    while (stack.length) {
      const [index, leaving] = stack.pop()
      if (leaving) { colors[index] = 2; continue }
      if (colors[index] === 1) fail('模型节点存在循环引用。')
      if (colors[index] === 2) continue
      colors[index] = 1
      stack.push([index, true])
      for (const child of nodes[index].children ?? []) stack.push([child, false])
    }
  }
  if (!scenes.length) fail('模型没有可显示的场景。')
  for (const scene of scenes) {
    object(scene, '场景')
    for (const root of array(scene.nodes, '场景根节点')) reference(root, nodes, '场景根节点')
  }
  const scene = reference(json.scene ?? 0, scenes, '默认场景')
  const reachable = [...(scene.nodes ?? [])]
  const seen = new Set()
  let visibleMesh = false
  while (reachable.length) {
    const index = reachable.pop()
    if (seen.has(index)) continue
    seen.add(index)
    if (nodes[index].mesh !== undefined) visibleMesh = true
    reachable.push(...(nodes[index].children ?? []))
  }
  if (!visibleMesh) fail('默认场景中没有可显示的网格。')
  for (const image of array(json.images, '纹理图片')) {
    object(image, '纹理图片')
    if (image.bufferView !== undefined) reference(image.bufferView, views, '纹理图片缓冲视图')
    else if (image.uri === undefined) fail('纹理图片缺少内嵌数据。')
  }
  const bounds = sceneBounds(json, accessors, nodes, scenes, json.scene ?? 0)
  return { meshCount: meshes.length, nodeCount: nodes.length, triangleCount, bytes, bounds }
}
