import { WebSocketServer } from 'ws'
import { getGameRow } from '../repo.js'
import { findUserBySession } from '../repo.js'
import { acceptPosition, validateEdit } from './rules.js'
import { addWorldStat, loadEdits, saveEdit } from './store.js'
import { spawnPoint, worldFromSpec } from './terrain.js'

const ADJ = ['bramble', 'pebble', 'lumen', 'marigold', 'cinder', 'quartz', 'willow', 'nimbus', 'poppy', 'cedar', 'amber', 'misty']
const NOUN = ['fox', 'kite', 'wren', 'mole', 'pike', 'lark', 'newt', 'finch', 'owl', 'hare']
const COLORS = ['#e6ff3a', '#ff5aa5', '#3aa0c8', '#ffbd70', '#4adeb9', '#f2a3c7', '#c46a4a', '#7aa2ff']

function cookie(req, name) {
  const raw = req.headers.cookie || ''
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) {
      try { return decodeURIComponent(part.slice(eq + 1).trim()) } catch { return '' }
    }
  }
  return ''
}

function title(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function guestName(used) {
  for (let i = 0; i < 12; i++) {
    const name = `${title(ADJ[Math.floor(Math.random() * ADJ.length)])} ${title(NOUN[Math.floor(Math.random() * NOUN.length)])}`
    if (!used.has(name)) return name
  }
  return `Guest ${Math.floor(Math.random() * 900 + 100)}`
}

function send(ws, payload) {
  if (ws.readyState !== 1) return
  try { ws.send(JSON.stringify(payload)) } catch { /* closed */ }
}

function eyeOf(player) {
  return { x: player.x, y: player.y + 1.62, z: player.z }
}

export function createWorldHub({ db, config }) {
  const rooms = new Map()
  const ipCounts = new Map()
  let wss = null
  const timer = setInterval(() => {
    for (const room of rooms.values()) broadcastPlayers(room)
  }, 100)
  if (typeof timer.unref === 'function') timer.unref()

  function broadcast(room, payload, except) {
    const raw = JSON.stringify(payload)
    for (const player of room.players.values()) {
      if (player === except || player.ws.readyState !== 1) continue
      try { player.ws.send(raw) } catch { /* closed */ }
    }
  }

  function others(room, selfId) {
    const list = []
    for (const player of room.players.values()) {
      if (player.id === selfId) continue
      list.push({
        id: player.id,
        name: player.name,
        x: Math.round(player.x * 100) / 100,
        y: Math.round(player.y * 100) / 100,
        z: Math.round(player.z * 100) / 100,
        yaw: Math.round(player.yaw * 1000) / 1000,
        color: player.color
      })
    }
    return list
  }

  function broadcastPlayers(room) {
    if (!room.players.size) return
    for (const player of room.players.values()) {
      send(player.ws, { t: 'players', players: others(room, player.id), online: room.players.size })
    }
  }

  async function roomFor(game) {
    let room = rooms.get(game.id)
    if (room) return room
    const world = worldFromSpec(game.spec || {})
    const edits = new Map()
    try {
      for (const edit of await loadEdits(db, game.id)) edits.set(`${edit.x},${edit.y},${edit.z}`, edit.block)
    } catch {
      // A missing table surfaces as a failed join below; an empty map is safer than a crash.
    }
    const spawn = spawnPoint(world, edits)
    room = { id: game.id, world, edits, spawn, players: new Map(), seq: 1 }
    rooms.set(game.id, room)
    return room
  }

  function dispose(room) {
    if (room.players.size) return
    rooms.delete(room.id)
  }

  async function join(ws, req, slug) {
    const ip = req.socket?.remoteAddress || 'unknown'
    let user = null
    try { user = await findUserBySession(db, cookie(req, 'pg_session')) } catch { user = null }
    let counted = false
    if (!user) {
      const cap = config.worldGuestCap || 8
      const n = ipCounts.get(ip) || 0
      if (n >= cap) {
        send(ws, { t: 'reject', reason: 'full' })
        ws.close(1008, 'full')
        return
      }
      ipCounts.set(ip, n + 1)
      counted = true
    }
    const releaseIp = () => {
      if (!counted) return
      counted = false
      const n = (ipCounts.get(ip) || 1) - 1
      if (n <= 0) ipCounts.delete(ip)
      else ipCounts.set(ip, n)
    }
    let game
    try { game = await getGameRow(db, slug) } catch { game = null }
    if (!game || game.status !== 'published' || game.type !== 'world') {
      releaseIp()
      send(ws, { t: 'reject', reason: 'missing' })
      ws.close(1008, 'missing')
      return
    }
    const room = await roomFor(game)
    const used = new Set([...room.players.values()].map((player) => player.name))
    const name = (user?.displayName || guestName(used)).slice(0, 40)
    const id = `p${room.seq++}`
    const player = {
      id,
      name,
      color: COLORS[room.seq % COLORS.length],
      ws,
      x: room.spawn.x,
      y: room.spawn.y,
      z: room.spawn.z,
      yaw: 0,
      pitch: -0.25,
      movedAt: Date.now(),
      markedAt: Date.now(),
      bucket: { tokens: 6, t: Date.now() },
      msgs: { tokens: 40, t: Date.now() },
      gone: false
    }
    room.players.set(id, player)
    const edits = []
    for (const [key, block] of room.edits) {
      const [x, y, z] = key.split(',').map(Number)
      edits.push([x, y, z, block])
    }
    send(ws, {
      t: 'welcome',
      id,
      name,
      color: player.color,
      spawn: { x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch },
      edits,
      players: others(room, id),
      online: room.players.size
    })
    broadcastPlayers(room)

    ws.on('message', async (raw) => {
      if (player.gone) return
      const text = String(raw)
      if (text.length > 2000) return
      let msg
      try { msg = JSON.parse(text) } catch { return }
      if (!msg || typeof msg !== 'object') return
      const now = Date.now()
      if (msg.t !== 'edit' && !takeMsg(player, now)) return
      if (msg.t === 'move') {
        const dt = Math.max(0.05, (now - player.movedAt) / 1000)
        const next = acceptPosition(player, msg, dt, room.world)
        player.x = next.x
        player.y = next.y
        player.z = next.z
        player.yaw = next.yaw
        player.pitch = next.pitch
        player.movedAt = now
        return
      }
      if (msg.t !== 'edit') return
      const dt = Math.max(0.05, (now - player.movedAt) / 1000)
      if (msg.px !== undefined) {
        const next = acceptPosition(player, { x: msg.px, y: msg.py, z: msg.pz, yaw: msg.yaw, pitch: msg.pitch }, dt, room.world)
        player.x = next.x
        player.y = next.y
        player.z = next.z
        player.yaw = next.yaw
        player.pitch = next.pitch
        player.movedAt = now
      }
      const verdict = validateEdit({
        x: msg.x,
        y: msg.y,
        z: msg.z,
        block: msg.block,
        eye: eyeOf(player),
        world: room.world,
        now,
        bucket: player.bucket
      })
      if (!verdict.ok) {
        const key = `${msg.x},${msg.y},${msg.z}`
        send(ws, { t: 'reject', reason: verdict.reason, x: msg.x, y: msg.y, z: msg.z, block: room.edits.has(key) ? room.edits.get(key) : null })
        return
      }
      const key = `${msg.x},${msg.y},${msg.z}`
      const previous = room.edits.has(key) ? room.edits.get(key) : undefined
      room.edits.set(key, msg.block)
      const placed = msg.block !== 0
      try {
        await saveEdit(db, room.id, { x: msg.x, y: msg.y, z: msg.z, block: msg.block }, player.name)
        if (placed) await addWorldStat(db, room.id, player.name, 1, 0)
      } catch {
        if (previous === undefined) room.edits.delete(key)
        else room.edits.set(key, previous)
        send(ws, { t: 'reject', reason: 'save', x: msg.x, y: msg.y, z: msg.z, block: previous ?? null })
        return
      }
      broadcast(room, { t: 'edit', x: msg.x, y: msg.y, z: msg.z, block: msg.block, name: player.name })
    })

    const leave = async () => {
      if (player.gone) return
      player.gone = true
      releaseIp()
      const delta = Date.now() - player.markedAt
      player.markedAt = Date.now()
      room.players.delete(id)
      try { await addWorldStat(db, room.id, player.name, 0, delta) } catch { /* still drop the socket */ }
      if (!room.players.size) dispose(room)
      else broadcastPlayers(room)
    }
    ws.on('close', () => { void leave() })
    ws.on('error', () => { try { ws.close() } catch { /* already closing */ } })
  }

  function takeMsg(player, now) {
    const bucket = player.msgs
    const elapsed = Math.max(0, (now - bucket.t) / 1000)
    bucket.t = now
    bucket.tokens = Math.min(40, bucket.tokens + elapsed * 30)
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }

  return {
    rooms,
    online(gameId) {
      return rooms.get(gameId)?.players.size || 0
    },
    reset(gameId) {
      const room = rooms.get(gameId)
      if (!room) return
      room.edits.clear()
      broadcast(room, { t: 'reset' })
    },
    attach(server) {
      wss = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => {
        let url
        try { url = new URL(req.url || '/', 'http://localhost') } catch { socket.destroy(); return }
        const match = url.pathname.match(/^\/api\/worlds\/([a-z0-9-]+)$/)
        if (!match) { socket.destroy(); return }
        const origin = req.headers.origin
        if (origin && config.mainOrigins?.length && !config.mainOrigins.includes(origin)) {
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => { void join(ws, req, match[1]) })
      })
    },
    async close() {
      clearInterval(timer)
      for (const room of rooms.values()) {
        for (const player of room.players.values()) {
          try { player.ws.close() } catch { /* closed */ }
        }
      }
      rooms.clear()
      if (wss) await new Promise((resolve) => wss.close(() => resolve()))
    }
  }
}
