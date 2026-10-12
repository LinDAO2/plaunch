import { WebSocketServer } from 'ws'
import { findUserBySession, getGameRow } from '../repo.js'
import { addHuman, applyInput, createMatch, packSnap, packWelcome, removeHuman, restartMatch, stepMatch } from './sim.js'
import { readArenaBlocks } from './render.js'

const ADJ = ['bramble', 'pebble', 'lumen', 'marigold', 'cinder', 'quartz', 'willow', 'nimbus']
const NOUN = ['fox', 'kite', 'wren', 'mole', 'pike', 'lark', 'newt', 'finch']

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

function titleWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function guestName(used) {
  for (let i = 0; i < 12; i++) {
    const name = `${titleWord(ADJ[Math.floor(Math.random() * ADJ.length)])} ${titleWord(NOUN[Math.floor(Math.random() * NOUN.length)])}`
    if (!used.has(name)) return name
  }
  return `Guest ${Math.floor(Math.random() * 900 + 100)}`
}

function send(ws, payload) {
  if (ws.readyState !== 1) return
  try { ws.send(JSON.stringify(payload)) } catch { /* closed */ }
}

function takeMsg(player, now) {
  const bucket = player.msgs
  const elapsed = Math.max(0, (now - bucket.t) / 1000)
  bucket.t = now
  bucket.tokens = Math.min(30, bucket.tokens + elapsed * 30)
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

export function createArenaHub({ db, config }) {
  const rooms = new Map()
  const ipCounts = new Map()
  let wss = null
  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      if (!room.players.size) continue
      if (room.match.over) {
        room.hold += 0.05
        if (room.hold >= 5) {
          restartMatch(room.match)
          room.hold = 0
        }
      } else {
        room.hold = 0
        stepMatch(room.match, 0.05)
      }
      const snap = packSnap(room.match)
      for (const player of room.players.values()) send(player.ws, { ...snap, you: player.actorId })
    }
  }, 50)
  if (typeof timer.unref === 'function') timer.unref()

  function roomFor(game) {
    let room = rooms.get(game.id)
    if (room) return room
    const blocks = readArenaBlocks(game.freeformHtml || '')
    room = {
      id: game.id,
      match: createMatch({ theme: blocks.theme, config: blocks.config, seed: game.id.length * 17 + 3 }),
      players: new Map(),
      hold: 0
    }
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
    const html = game?.freeformHtml || ''
    if (!game || game.status !== 'published' || game.tier !== 'freeform' || !html.includes('playground-engine: three')) {
      releaseIp()
      send(ws, { t: 'reject', reason: 'missing' })
      ws.close(1008, 'missing')
      return
    }
    const room = roomFor(game)
    const used = new Set([...room.players.values()].map((player) => player.name))
    const name = (user?.displayName || guestName(used)).slice(0, 40)
    const actor = addHuman(room.match, name)
    if (!actor) {
      releaseIp()
      send(ws, { t: 'reject', reason: 'full' })
      ws.close(1008, 'full')
      return
    }
    const player = {
      id: actor.id,
      actorId: actor.id,
      name,
      ws,
      msgs: { tokens: 30, t: Date.now() },
      gone: false
    }
    room.players.set(actor.id, player)
    send(ws, packWelcome(room.match, actor))

    ws.on('message', (raw) => {
      if (player.gone) return
      const text = String(raw)
      if (text.length > 600) return
      let msg
      try { msg = JSON.parse(text) } catch { return }
      if (!msg || msg.t !== 'in') return
      if (!takeMsg(player, Date.now())) return
      const body = room.match.actors.find((item) => item.id === actor.id)
      if (!body) return
      applyInput(body, msg)
    })

    ws.on('close', () => {
      if (player.gone) return
      player.gone = true
      room.players.delete(actor.id)
      removeHuman(room.match, actor.id)
      releaseIp()
      dispose(room)
    })
  }

  return {
    rooms,
    online(gameId) {
      return rooms.get(gameId)?.players.size || 0
    },
    attach(server) {
      wss = new WebSocketServer({ noServer: true })
      server.on('upgrade', (req, socket, head) => {
        let url
        try { url = new URL(req.url || '/', 'http://localhost') } catch { socket.destroy(); return }
        const match = url.pathname.match(/^\/api\/arenas\/([a-z0-9-]+)$/)
        if (!match) {
          if (!/^\/api\/worlds\/[a-z0-9-]+$/.test(url.pathname)) socket.destroy()
          return
        }
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
