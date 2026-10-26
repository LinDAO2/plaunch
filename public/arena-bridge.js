export function attachArenaBridge({ frame, slug }) {
  let ws = null
  let opened = false
  let ready = false

  function relay(payload) {
    const target = frame()
    if (!target || !target.contentWindow) return
    try { target.contentWindow.postMessage({ type: 'playground-arena-state', payload }, '*') } catch { /* frame gone */ }
  }

  function sendReady() {
    if (!ready || !ws || ws.readyState !== 1) return
    try { ws.send(JSON.stringify({ t: 'go' })) } catch { /* closed */ }
  }

  function ensure() {
    if (opened) return
    opened = true
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}/api/arenas/${slug}`)
    ws.addEventListener('open', () => sendReady())
    ws.addEventListener('message', (event) => {
      let payload = null
      try { payload = JSON.parse(event.data) } catch { return }
      relay(payload)
    })
    ws.addEventListener('close', () => relay({ t: 'bye' }))
  }

  return {
    onMessage(data) {
      if (!data || typeof data !== 'object') return false
      if (data.type === 'playground-arena-hello') {
        ensure()
        return true
      }
      if (data.type === 'playground-arena-ready') {
        ready = true
        ensure()
        sendReady()
        return true
      }
      if (data.type !== 'playground-arena-input') return false
      ensure()
      if (!ws || ws.readyState !== 1) return true
      const num = (value, min, max) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return 0
        return Math.max(min, Math.min(max, n))
      }
      const wrapYaw = (value) => {
        const n = Number(value)
        if (!Number.isFinite(n)) return 0
        let a = n % (Math.PI * 2)
        if (a > Math.PI) a -= Math.PI * 2
        if (a < -Math.PI) a += Math.PI * 2
        return a
      }
      ws.send(JSON.stringify({
        t: 'in',
        seq: num(data.seq, 0, 1e9),
        yaw: wrapYaw(data.yaw),
        pitch: num(data.pitch, -1.4, 1.4),
        mx: num(data.mx, -1, 1),
        mz: num(data.mz, -1, 1),
        fire: data.fire === 1 || data.fire === true ? 1 : 0,
        jump: data.jump === 1 || data.jump === true ? 1 : 0
      }))
      return true
    }
  }
}
