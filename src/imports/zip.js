import { deflateRawSync, inflateRawSync } from 'node:zlib'

const MAX_FILES = 40
const MAX_BYTES = 2 * 1024 * 1024

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value))
}

export function unzip(buffer, { maxFiles = MAX_FILES, maxBytes = MAX_BYTES } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Upload is not a ZIP archive')
  }
  const files = {}
  let offset = 0
  let total = 0
  let count = 0
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset)
    if (sig === 0x02014b50 || sig === 0x06054b50) break
    if (sig !== 0x04034b50) throw new Error('ZIP is not a valid archive')
    const flags = buf.readUInt16LE(offset + 6)
    const method = buf.readUInt16LE(offset + 8)
    const compSize = buf.readUInt32LE(offset + 18)
    const nameLen = buf.readUInt16LE(offset + 26)
    const extraLen = buf.readUInt16LE(offset + 28)
    if (flags & 0x1) throw new Error('Encrypted ZIP files are not supported')
    if (flags & 0x8) throw new Error('ZIP data descriptors are not supported')
    const nameStart = offset + 30
    const name = buf.slice(nameStart, nameStart + nameLen).toString('utf8').replace(/\\/g, '/')
    const dataStart = nameStart + nameLen + extraLen
    if (dataStart + compSize > buf.length) throw new Error(`ZIP entry is truncated: ${name}`)
    const compressed = buf.slice(dataStart, dataStart + compSize)
    offset = dataStart + compSize
    if (!name || name.endsWith('/')) continue
    if (name.split('/').some((part) => part === '..' || part === '')) {
      throw new Error(`ZIP path is not allowed: ${name}`)
    }
    let data
    if (method === 0) data = compressed
    else if (method === 8) data = inflateRawSync(compressed)
    else throw new Error(`ZIP compression method ${method} is not supported`)
    total += data.length
    count += 1
    if (count > maxFiles) throw new Error('ZIP has more than 40 files')
    if (total > maxBytes) throw new Error('ZIP unpacks to more than 2MB')
    files[name.replace(/^\.\//, '')] = data
  }
  if (!count) throw new Error('ZIP has no files')
  return files
}

function pack(entries, methodFor) {
  const names = Object.keys(entries)
  const locals = []
  const centrals = []
  let offset = 0
  for (const name of names) {
    const raw = asBuffer(entries[name])
    const method = methodFor(name)
    const data = method === 8 ? deflateRawSync(raw) : raw
    const nameBuf = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(names.length, 8)
  end.writeUInt16LE(names.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

export function zipStore(entries) {
  return pack(entries, () => 0)
}

export function zipDeflate(entries) {
  return pack(entries, () => 8)
}
