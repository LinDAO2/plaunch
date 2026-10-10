import { mountArcade } from '/arcade-view.js'

export const typeNames = { tap: 'TAP CHALLENGE', reaction: 'REACTION TEST', guess: 'NUMBER GUESS', dodge: 'METEOR DODGE', arcade: 'ARCADE' }

export function controlHint(game) {
  if (game?.spec?.controls?.keyboard && game?.spec?.controls?.touch) {
    return `${game.spec.controls.keyboard} · ${game.spec.controls.touch}`
  }
  if (game?.type === 'dodge') return 'Arrow keys or A/D · on-screen arrows'
  if (game?.type === 'reaction') return 'Wait for the signal, then tap. Faster is better.'
  if (game?.type === 'guess') return 'Guess a number from 1 to 10. Fewer attempts score higher.'
  return 'Tap as many times as you can before time runs out.'
}

export function createRuntime(els, hooks = {}) {
  let timer = null
  let timeout = null
  let playing = false
  let phase = ''
  let points = 0
  let remaining = 10
  let secret = 0
  let startedAt = 0
  let lastScore = null
  let dodgeFrame = null
  let arcade = null
  let obstacles = []
  let dodgeX = 50
  let dodgeTick = 0
  const dodgeKeys = new Set()
  let game = { name: '', description: '', type: 'tap', duration: 10, accent: '#a88bff' }
  let playStarted = false

  function emitStart() {
    if (playStarted) return
    playStarted = true
    hooks.onPlayStarted?.(game)
  }

  function clear() {
    clearInterval(timer)
    clearTimeout(timeout)
    cancelAnimationFrame(dodgeFrame)
    arcade?.stop()
    arcade = null
    dodgeKeys.clear()
    playing = false
    phase = ''
    points = 0
    lastScore = null
    playStarted = false
    remaining = Number(game.duration) || 10
    obstacles = []
    els.score.textContent = 'Score: 0'
    els.timer.textContent = `Time: ${remaining}s`
    els.label.textContent = 'READY, PLAYER ONE'
    els.display.textContent = '0'
    els.play.textContent = 'Start game'
    els.play.hidden = false
    els.field.replaceChildren()
    els.field.style.pointerEvents = 'none'
    if (els.guess) {
      els.guess.hidden = true
      els.guess.value = ''
    }
  }

  function paintIdle() {
    els.display.textContent = ({ tap: '0', reaction: '⚡', guess: '?', dodge: '☄' })[game.type] || '0'
    if (els.root) els.root.style.borderColor = game.accent || '#a88bff'
  }

  function finish(value, label, opts = {}) {
    playing = false
    phase = 'done'
    clearInterval(timer)
    clearTimeout(timeout)
    cancelAnimationFrame(dodgeFrame)
    arcade?.stop()
    arcade = null
    els.field.replaceChildren()
    els.field.style.pointerEvents = 'none'
    if (els.guess) els.guess.hidden = true
    els.display.textContent = String(value)
    els.label.textContent = label
    els.play.hidden = false
    els.play.textContent = 'Play again'
    lastScore = opts.keepScore === false ? null : points
    hooks.onFinish?.({ points: lastScore, mechanic: game.type, game })
  }

  function spawnInterval() {
    const rate = Number(game.spec?.spawn?.rate)
    const base = game.spec?.difficulty === 'hard' ? 450 : game.spec?.difficulty === 'easy' ? 900 : 650
    if (!Number.isFinite(rate) || rate <= 0) return base
    return Math.max(180, Math.round(base / rate))
  }

  function run() {
    const g = game
    if (g.type === 'arcade') {
      clear()
      playing = true
      els.display.textContent = ''
      els.play.hidden = true
      els.label.textContent = 'ARCADE'
      emitStart()
      const spec = g.spec?.runtime === 'arcade' ? g.spec : null
      if (!spec) {
        finish('!', 'NO ARCADE SPEC', { keepScore: false })
        return
      }
      arcade = mountArcade(els.field, spec, {
        keys: dodgeKeys,
        onScore(snap) {
          points = snap.score
          els.score.textContent = `Score: ${points}`
          const left = Math.max(0, Math.ceil(((Number(g.duration) || 20) * 1000 - snap.time) / 1000))
          els.timer.textContent = `Time: ${left}s`
        },
        onEnd(snap) {
          points = snap.score
          els.score.textContent = `Score: ${points}`
          finish(snap.won ? '🏆' : String(snap.score), snap.won ? 'YOU WIN' : 'GAME OVER')
        }
      })
      return
    }
    if (g.type === 'tap') {
      if (!playing) {
        clear()
        playing = true
        remaining = g.duration
        els.play.textContent = 'TAP!'
        els.label.textContent = 'GO GO GO'
        emitStart()
        timer = setInterval(() => {
          remaining -= 1
          els.timer.textContent = `Time: ${remaining}s`
          if (remaining <= 0) finish(`${points} 🎉`, 'TIME UP')
        }, 1000)
      } else {
        points += 1
        els.score.textContent = `Score: ${points}`
        els.display.textContent = String(points)
      }
      return
    }
    if (g.type === 'reaction') {
      if (phase === 'wait') {
        clearTimeout(timeout)
        finish('⚠', 'TOO EARLY', { keepScore: false })
      } else if (phase === 'ready') {
        const ms = Math.max(1, Math.round(performance.now() - startedAt))
        points = ms
        els.score.textContent = `Reaction: ${ms}ms`
        finish(`${ms}ms`, 'NICE REFLEX')
      } else {
        clear()
        phase = 'wait'
        els.display.textContent = '…'
        els.label.textContent = 'WAIT FOR THE SIGNAL'
        els.play.textContent = 'Wait…'
        emitStart()
        timeout = setTimeout(() => {
          if (phase !== 'wait') return
          phase = 'ready'
          startedAt = performance.now()
          els.display.textContent = 'GO!'
          els.label.textContent = 'CLICK NOW'
          els.play.textContent = 'CLICK!'
        }, 1500 + Math.random() * 2300)
      }
      return
    }
    if (g.type === 'guess') {
      if (phase !== 'guess') {
        clear()
        phase = 'guess'
        secret = 1 + Math.floor(Math.random() * 10)
        els.label.textContent = 'GUESS 1–10'
        els.display.textContent = '?'
        els.play.textContent = 'Enter guess'
        els.timer.textContent = 'No timer'
        if (els.guess) {
          els.guess.hidden = false
          els.guess.value = ''
          els.guess.focus()
        }
        emitStart()
      } else {
        const raw = els.guess ? els.guess.value : window.prompt('Choose a number from 1 to 10')
        if (raw === null) return
        const n = Number(String(raw).trim())
        if (!Number.isInteger(n) || n < 1 || n > 10) {
          hooks.onToast?.('Enter a whole number from 1 to 10')
          return
        }
        points += 1
        els.score.textContent = `Attempts: ${points}`
        if (n === secret) {
          points = Math.max(10, 100 - points * 10)
          finish('🎉', 'YOU GUESSED IT')
        } else {
          els.display.textContent = n < secret ? '↑ HIGHER' : '↓ LOWER'
          if (els.guess) els.guess.value = ''
        }
      }
      return
    }
    if (g.type === 'dodge') {
      clear()
      playing = true
      points = 0
      remaining = g.duration
      dodgeX = 50
      dodgeTick = 0
      obstacles = []
      els.display.textContent = ''
      els.play.hidden = true
      els.label.textContent = 'DODGE THE METEORS'
      emitStart()
      const player = document.createElement('div')
      player.className = 'dodge-player'
      const controls = document.createElement('div')
      controls.className = 'dodge-controls'
      for (const [dir, label] of [['left', '←'], ['right', '→']]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.move = dir
        button.setAttribute('aria-label', dir === 'left' ? 'Move left' : 'Move right')
        button.textContent = label
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault()
          move(dir === 'left' ? -1 : 1)
        })
        controls.append(button)
      }
      els.field.replaceChildren(player, controls)
      els.field.style.pointerEvents = 'auto'
      const move = (dir) => {
        dodgeX = Math.min(94, Math.max(6, dodgeX + dir * 9))
        player.style.left = `calc(${dodgeX}% - 21px)`
      }
      timer = setInterval(() => {
        remaining -= 1
        els.timer.textContent = `Time: ${remaining}s`
        if (remaining <= 0) {
          els.field.style.pointerEvents = 'none'
          finish('🏆', 'YOU SURVIVED')
        }
      }, 1000)
      let prev = performance.now()
      const frame = (now) => {
        if (!playing) return
        const dt = Math.min(45, now - prev)
        prev = now
        dodgeTick += dt
        if (dodgeKeys.has('ArrowLeft') || dodgeKeys.has('a')) move(-0.15 * dt)
        if (dodgeKeys.has('ArrowRight') || dodgeKeys.has('d')) move(0.15 * dt)
        if (dodgeTick > spawnInterval()) {
          dodgeTick = 0
          const x = 8 + Math.random() * 84
          const el = document.createElement('div')
          el.className = 'meteor'
          els.field.append(el)
          obstacles.push({ x, y: -10, el })
        }
        for (const obstacle of obstacles) {
          obstacle.y += dt * 0.055
          obstacle.el.style.left = `calc(${obstacle.x}% - 16px)`
          obstacle.el.style.top = `${obstacle.y}%`
          if (obstacle.y > 72 && obstacle.y < 87 && Math.abs(obstacle.x - dodgeX) < 8) {
            els.field.style.pointerEvents = 'none'
            finish(points, 'CRASHED!')
            return
          }
        }
        obstacles = obstacles.filter((obstacle) => {
          if (obstacle.y <= 105) return true
          obstacle.el.remove()
          points += 10
          els.score.textContent = `Score: ${points}`
          return false
        })
        dodgeFrame = requestAnimationFrame(frame)
      }
      dodgeFrame = requestAnimationFrame(frame)
    }
  }

  function onKeyDown(event) {
    const tag = document.activeElement?.tagName
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(event.key)) {
      dodgeKeys.add(event.key.length === 1 ? event.key.toLowerCase() : event.key)
      if (playing) event.preventDefault()
    }
  }
  function onKeyUp(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    dodgeKeys.delete(event.key)
    dodgeKeys.delete(key)
  }

  els.play.addEventListener('click', run)
  if (els.guess) {
    els.guess.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        run()
      }
    })
  }
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)

  return {
    setGame(next) {
      game = { duration: 10, type: 'tap', accent: '#a88bff', ...next }
      clear()
      paintIdle()
    },
    destroy() {
      clear()
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    },
    getLastScore() {
      return lastScore
    }
  }
}
