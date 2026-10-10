export function readSandboxScore(event, frame) {
  if (!frame || event.source !== frame.contentWindow) return null
  if (event.origin !== 'null') return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const keys = Object.keys(data)
  if (keys.length !== 2 || !keys.includes('type') || !keys.includes('points')) return null
  if (data.type !== 'playground-score') return null
  if (!Number.isInteger(data.points) || data.points < 0 || data.points > 100000) return null
  return data.points
}

// The usercontent prelude reports the game's natural size when it overflows the frame.
export function readSandboxSize(event, frame) {
  if (!frame || event.source !== frame.contentWindow) return null
  if (event.origin !== 'null') return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'playground-size') return null
  const width = Number(data.width)
  const height = Number(data.height)
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < 100 || height < 100 || width > 2400 || height > 2400) return null
  return { width, height }
}

// Render the iframe at the game's natural size and scale it down to fit the field.
// The browser maps pointer input through the transform, so game coordinates stay correct.
export function fitSandboxFrame(frame, size) {
  const field = frame?.parentElement
  if (!field || !size) return
  const scale = Math.min(field.clientWidth / size.width, field.clientHeight / size.height, 1)
  frame.style.width = `${size.width}px`
  frame.style.height = `${size.height}px`
  frame.style.right = 'auto'
  frame.style.bottom = 'auto'
  frame.style.left = `${Math.max(0, (field.clientWidth - size.width * scale) / 2)}px`
  frame.style.top = `${Math.max(0, (field.clientHeight - size.height * scale) / 2)}px`
  frame.style.transformOrigin = '0 0'
  frame.style.transform = `scale(${scale})`
}
