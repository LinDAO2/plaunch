const KEY = 'pg-sound'
let enabled = false
try {
  enabled = localStorage.getItem(KEY) === 'on'
} catch {
  enabled = false
}

let audio = null

function context() {
  if (!enabled) return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audio) audio = new Ctx()
  if (audio.state === 'suspended') audio.resume().catch(() => {})
  return audio
}

export function soundOn() {
  return enabled
}

export function setSound(on) {
  enabled = Boolean(on)
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off')
  } catch {
    /* private mode */
  }
  if (enabled) context()
  return enabled
}

export function bindSound(button) {
  if (!button) return
  const paint = () => {
    button.textContent = enabled ? 'Sound on' : 'Sound off'
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false')
  }
  paint()
  button.addEventListener('click', () => {
    setSound(!enabled)
    paint()
    if (enabled) blip('score')
  })
}

export function blip(kind) {
  const ac = context()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = kind === 'hurt' ? 'square' : 'triangle'
  osc.frequency.value = kind === 'hurt' ? 140 : kind === 'go' ? 720 : 520
  gain.gain.value = 0.05
  osc.connect(gain)
  gain.connect(ac.destination)
  osc.start()
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12)
  osc.stop(ac.currentTime + 0.13)
}

export function shake(el) {
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
}

export function burst(host, x, y, color) {
  if (!host) return
  const tone = color || '#e6ff3a'
  for (let i = 0; i < 8; i++) {
    const bit = document.createElement('i')
    bit.className = 'particle'
    bit.style.left = `${x}%`
    bit.style.top = `${y}%`
    bit.style.background = tone
    const angle = (Math.PI * 2 * i) / 8
    const dist = 16 + (i % 3) * 8
    bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    bit.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    host.append(bit)
    bit.addEventListener('animationend', () => bit.remove())
  }
}
