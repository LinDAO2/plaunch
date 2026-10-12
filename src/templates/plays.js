export const RULES = {
  'word-guess': `/* PLAYGROUND RULE scoreGuess */
function scoreGuess(guess, answer) {
  let score = 0
  const spare = {}
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) score += 20
    else spare[answer[i]] = (spare[answer[i]] || 0) + 1
  }
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] !== answer[i] && spare[guess[i]]) {
      score += 8
      spare[guess[i]] -= 1
    }
  }
  return score
}
/* PLAYGROUND END RULE scoreGuess */`,
  'block-drop': `/* PLAYGROUND RULE scoreLines */
function scoreLines(n) {
  return n * n * 100
}
/* PLAYGROUND END RULE scoreLines */`,
  snake: `/* PLAYGROUND RULE scoreFood */
function scoreFood(length) {
  return 10
}
/* PLAYGROUND END RULE scoreFood */`,
  'merge-tiles': `/* PLAYGROUND RULE scoreMerge */
function scoreMerge(value) {
  return value
}
/* PLAYGROUND END RULE scoreMerge */`,
  flap: `/* PLAYGROUND RULE scoreGate */
function scoreGate() {
  return 1
}
/* PLAYGROUND END RULE scoreGate */`,
  breakout: `/* PLAYGROUND RULE scoreBrick */
function scoreBrick() {
  return 10
}
/* PLAYGROUND END RULE scoreBrick */`,
  platformer: `/* PLAYGROUND RULE scoreCoin */
function scoreCoin() {
  return 25
}
/* PLAYGROUND END RULE scoreCoin */`,
  'endless-runner': `/* PLAYGROUND RULE scoreHurdle */
function scoreHurdle() {
  return 5
}
/* PLAYGROUND END RULE scoreHurdle */`,
  'space-shooter': `/* PLAYGROUND RULE scoreHit */
function scoreHit() {
  return 15
}
/* PLAYGROUND END RULE scoreHit */`,
  'maze-chomper': `/* PLAYGROUND RULE scorePellet */
function scorePellet() {
  return 10
}
/* PLAYGROUND END RULE scorePellet */`,
  'jump-up': `/* PLAYGROUND RULE scorePlatform */
function scorePlatform() {
  return 5
}
/* PLAYGROUND END RULE scorePlatform */`,
  'match-3': `/* PLAYGROUND RULE scoreGroup */
function scoreGroup(n) {
  return n * 10
}
/* PLAYGROUND END RULE scoreGroup */`
}

export const PLAY = {
  'word-guess': `
function mount() {
  beginPlay(function () {
    const length = CONFIG.letters
    let pool = (typeof ANSWERS === 'undefined' ? ['crane'] : ANSWERS).filter(function (word) { return word.length === length })
    if (!pool.length) pool = ['crane'].map(function (word) { return (word + 'planet').slice(0, length) })
    const answer = pool[Math.floor(Math.random() * pool.length)]
    const rows = []
    const revealedAt = []
    let guess = ''
    let time = 0
    let done = false
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    function submit(text) {
      if (done) return
      const word = (text || guess || 'crane').toLowerCase().slice(0, length).padEnd(length, 'a')
      const score = RULES.scoreGuess(word, answer)
      rows.push(word)
      revealedAt.push(time)
      guess = ''
      award(score)
      if (word === answer || rows.length >= CONFIG.maxGuesses) {
        done = true
        window.__share = rows.map(function (rowWord) {
          return rowWord.split('').map(function (ch, i) {
            if (ch === answer[i]) return '🟩'
            if (answer.indexOf(ch) >= 0) return '🟨'
            return '⬛'
          }).join('')
        }).join(' ')
        finish(score)
      }
    }
    onKeyPress(function (key) {
      if (done) return
      if (key === 'enter' || key === 'space') submit(guess)
      else if (key === 'backspace') guess = guess.slice(0, -1)
      else if (/^[a-z]$/.test(key) && guess.length < length) guess += key
    })
    onUpdate(function () {
      time += Math.min(dt(), 0.05)
      if (!done && time > 1.1 && rows.length === 0 && guess.length === 0) submit('crane')
      if (pointer.down && pointer.y > 300 && pointer.y < 408) {
        const col = Math.max(0, Math.min(12, Math.floor(pointer.x / (480 / 13))))
        const row = pointer.y < 354 ? 0 : 1
        const letter = letters[row * 13 + col]
        if (letter && guess.length < length && guess[guess.length - 1] !== letter) guess += letter
      }
    })
    onDraw(function () {
      for (let r = 0; r < CONFIG.maxGuesses; r++) {
        const word = rows[r] || (r === rows.length ? guess : '')
        for (let c = 0; c < length; c++) {
          const ch = word[c] || ''
          const settled = rows[r] ? (rows[r][c] === answer[c] ? '#3FB950' : (answer.indexOf(rows[r][c]) >= 0 ? '#E3B341' : '#3A3F47')) : '#3A3F47'
          let mark = settled
          let show = ch
          let scale = 1
          if (rows[r] && revealedAt[r] != null) {
            const age = time - revealedAt[r] - c * 0.1
            if (age < 0.25) {
              const p = Math.max(0, age) / 0.25
              scale = Math.abs(Math.cos(p * Math.PI))
              if (p < 0.5) { mark = '#F4F7FB'; show = '' }
            }
          }
          const tileW = 58
          const tileH = 54
          const gap = 8
          const ox = Math.floor((480 - length * tileW - (length - 1) * gap) / 2)
          const h = Math.max(8, tileH * scale)
          const y = 96 + r * (tileH + gap) + (tileH - h) / 2
          const x = ox + c * (tileW + gap)
          brick(x, y, tileW - 6, h, ink(mark))
          const light = mark === '#3FB950' || mark === '#E3B341' || mark === '#F4F7FB'
          if (show) drawText({ text: show.toUpperCase(), size: 26, pos: vec2(x + 16, y + 12), color: light ? rgb(27, 27, 47) : rgb(244, 247, 251) })
        }
      }
    })
  })
}
`,
  'block-drop': `
function mount() {
  beginPlay(function () {
    const SHAPES = [[[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]], [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]]]
    const cols = CONFIG.cols
    const rows = CONFIG.rows
    const grid = []
    for (let y = 0; y < rows; y++) grid.push(Array(cols).fill(0))
    for (let y = rows - 2; y < rows; y++) {
      for (let x = 0; x < cols; x++) if ((x + y) % 3 !== 0) grid[y][x] = (x % 4) + 1
    }
    let piece = { s: 2, x: 3, y: 0 }
    let drop = 0
    let score = 0
    let actWas = false
    function shapeOf(index) { return SHAPES[index % SHAPES.length] }
    function cells(p) {
      const shape = shapeOf(p.s)
      const out = []
      for (let y = 0; y < shape.length; y++) for (let x = 0; x < shape[y].length; x++) if (shape[y][x]) out.push([p.x + x, p.y + y])
      return out
    }
    function fits(p) {
      return cells(p).every(function (cell) {
        return cell[0] >= 0 && cell[0] < cols && cell[1] < rows && (cell[1] < 0 || !grid[cell[1]][cell[0]])
      })
    }
    function lock() {
      for (const cell of cells(piece)) if (cell[1] >= 0) grid[cell[1]][cell[0]] = (piece.s % 4) + 1
      let cleared = 0
      for (let y = rows - 1; y >= 0; y--) {
        if (grid[y].every(Boolean)) {
          grid.splice(y, 1)
          grid.unshift(Array(cols).fill(0))
          cleared += 1
          y += 1
        }
      }
      score += cleared ? RULES.scoreLines(cleared) : 1
      award(score)
      piece = { s: (piece.s + 3) % SHAPES.length, x: 3, y: 0 }
      if (!fits(piece)) finish(score)
    }
    function rotate() {
      const shape = shapeOf(piece.s)
      const next = []
      const w = shape[0].length
      const h = shape.length
      for (let x = 0; x < w; x++) {
        next.push([])
        for (let y = h - 1; y >= 0; y--) next[x].push(shape[y][x])
      }
      const previous = SHAPES[piece.s]
      SHAPES[piece.s] = next
      if (!fits(piece)) SHAPES[piece.s] = previous
    }
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      drop += step
      const controls = pad()
      if (controls.x < 0 && fits({ s: piece.s, x: piece.x - 1, y: piece.y })) piece.x -= 1
      if (controls.x > 0 && fits({ s: piece.s, x: piece.x + 1, y: piece.y })) piece.x += 1
      if (controls.y < 0) rotate()
      const act = controls.act
      if (act && !actWas) {
        while (fits({ s: piece.s, x: piece.x, y: piece.y + 1 })) piece.y += 1
        lock()
      }
      actWas = act
      if (drop > CONFIG.dropMs / 1000) {
        drop = 0
        if (fits({ s: piece.s, x: piece.x, y: piece.y + 1 })) piece.y += 1
        else lock()
      }
    })
    onDraw(function () {
      const tones = [rgb(255, 210, 63), rgb(244, 247, 251), rgb(63, 185, 80), rgb(255, 154, 31), rgb(255, 90, 60)]
      const cell = Math.min(26, Math.floor(400 / rows), Math.floor(300 / cols))
      const ox = Math.floor((480 - cols * cell) / 2)
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x]) {
        brick(ox + x * cell + 1, 52 + y * cell + 1, cell - 4, cell - 4, tones[(grid[y][x] - 1) % tones.length])
      }
      for (const spot of cells(piece)) {
        brick(ox + spot[0] * cell + 1, 52 + spot[1] * cell + 1, cell - 4, cell - 4, tones[piece.s % tones.length])
      }
    })
  })
}
`,
  snake: `
function mount() {
  beginPlay(function () {
    const cols = CONFIG.cols
    const rows = CONFIG.rows
    const snake = [{ x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }]
    let dir = { x: 1, y: 0 }
    let food = { x: 5, y: 8 }
    let acc = 0
    let score = 0
    onUpdate(function () {
      acc += Math.min(dt(), 0.05)
      const controls = pad()
      if (Math.abs(controls.x) > Math.abs(controls.y) && controls.x !== -dir.x) dir = { x: controls.x > 0 ? 1 : -1, y: 0 }
      else if (controls.y && controls.y !== -dir.y) dir = { x: 0, y: controls.y > 0 ? 1 : -1 }
      if (acc < CONFIG.stepMs / 1000) return
      acc = 0
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some(function (part) { return part.x === head.x && part.y === head.y })) {
        finish(score)
        return
      }
      snake.unshift(head)
      if (head.x === food.x && head.y === food.y) {
        score += RULES.scoreFood(snake.length)
        award(score)
        food = { x: (food.x + 7) % cols, y: (food.y + 5) % rows }
      } else snake.pop()
    })
    onDraw(function () {
      const cell = Math.min(26, Math.floor(400 / rows))
      const ox = Math.floor((480 - cols * cell) / 2)
      drawRect({ pos: vec2(ox - 10, 40), width: cols * cell + 20, height: rows * cell + 20, color: rgb(36, 78, 32) })
      if (!tileSprite(9, ox + food.x * cell, 48 + food.y * cell, cell - 2, cell - 2)) stamp(THEME.sprites.fruit, ox + food.x * cell, 48 + food.y * cell, Math.max(10, cell / 2))
      for (let i = 0; i < snake.length; i++) {
        const part = snake[i]
        if (i === 0 && cast(0, ox + part.x * cell - 6, 42 + part.y * cell - 6, cell + 10)) continue
        brick(ox + part.x * cell + 1, 48 + part.y * cell + 1, cell - 4, cell - 4, i === 0 ? rgb(255, 210, 63) : rgb(63, 185, 80))
      }
    })
  })
}
`,
  'merge-tiles': `
function mount() {
  beginPlay(function () {
    const size = CONFIG.size
    const grid = []
    for (let y = 0; y < size; y++) grid.push(Array(size).fill(0))
    grid[0][0] = 2
    grid[0][1] = 2
    let score = 0
    let time = 0
    let moved = false
    function slide(row) {
      const nums = row.filter(Boolean)
      const out = []
      let gained = 0
      for (let i = 0; i < nums.length; i++) {
        if (nums[i] === nums[i + 1]) {
          const value = nums[i] * 2
          out.push(value)
          gained += RULES.scoreMerge(value)
          i += 1
        } else out.push(nums[i])
      }
      while (out.length < size) out.push(0)
      return { row: out, gained: gained }
    }
    function left() {
      let gained = 0
      for (let y = 0; y < size; y++) {
        const next = slide(grid[y])
        grid[y] = next.row
        gained += next.gained
      }
      return gained
    }
    onUpdate(function () {
      time += Math.min(dt(), 0.05)
      const controls = pad()
      if (moved) return
      if (controls.x < 0 || controls.act || time > 0.9) {
        moved = true
        score += left()
        award(score)
      }
    })
    onDraw(function () {
      const cell = Math.floor(360 / size)
      const ox = Math.floor((480 - size * cell) / 2)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        brick(ox + x * cell + 4, 78 + y * cell + 4, cell - 12, cell - 12, grid[y][x] ? ink(THEME.palette.accent) : rgb(210, 190, 235))
        if (grid[y][x]) drawText({ text: String(grid[y][x]), size: 28, pos: vec2(ox + x * cell + 18, 90 + y * cell), color: rgb(27, 27, 47) })
      }
    })
  })
}
`,
  flap: `
function mount() {
  beginPlay(function () {
    let y = 180
    let v = 0
    let score = 0
    let flapped = false
    const pipes = [{ x: 520, scored: false }]
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      const flapNow = controls.act || pointer.down
      if (flapNow && !flapped) {
        v = CONFIG.flap
        flapped = true
      }
      if (!flapNow) flapped = false
      v += CONFIG.gravity * step
      y += v * step
      for (const pipe of pipes) {
        pipe.x -= CONFIG.speed * step
        if (!pipe.scored && pipe.x < 70) {
          pipe.scored = true
          score += RULES.scoreGate()
          award(score)
        }
        const gapTop = 140
        if (pipe.x < 110 && pipe.x > 40 && (y < gapTop || y > gapTop + CONFIG.gap)) finish(score)
      }
      if (y > 400 || y < 8) finish(score)
    })
    onDraw(function () {
      if (!cast(4, 28, y - 36, 72)) stamp(THEME.sprites.bird, 40, y - 24, 22)
      for (const pipe of pipes) {
        brick(pipe.x, 0, 64, 128, rgb(63, 185, 80))
        brick(pipe.x - 8, 112, 80, 18, rgb(40, 130, 55))
        brick(pipe.x, 140 + CONFIG.gap, 64, 280, rgb(63, 185, 80))
        brick(pipe.x - 8, 140 + CONFIG.gap, 80, 18, rgb(40, 130, 55))
      }
    })
  })
}
`,
  breakout: `
function mount() {
  beginPlay(function () {
    let x = 240
    let y = 300
    let vx = 90
    let vy = -CONFIG.ballSpeed
    let px = 240
    let score = 0
    const bricks = []
    for (let r = 0; r < CONFIG.rows; r++) for (let c = 0; c < CONFIG.cols; c++) bricks.push({ x: 36 + c * 52, y: 64 + r * 22, alive: true })
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      px = Math.max(40, Math.min(440, px + controls.x * 280 * step))
      if (pointer.y < 400) px = Math.max(40, Math.min(440, pointer.x))
      x += vx * step
      y += vy * step
      if (x < 12 || x > 468) vx *= -1
      if (y < 12) vy = Math.abs(vy)
      for (const brick of bricks) {
        if (!brick.alive) continue
        if (Math.abs(brick.x + 20 - x) < 28 && Math.abs(brick.y + 8 - y) < 16) {
          brick.alive = false
          vy = Math.abs(vy)
          score += RULES.scoreBrick()
          award(score)
        }
      }
      if (y > 430) {
        if (Math.abs(x - px) < 54) vy = -Math.abs(vy)
        else finish(score)
      }
    })
    onDraw(function () {
      const colors = [rgb(255, 46, 99), rgb(255, 210, 63), rgb(47, 123, 255), rgb(63, 185, 80), rgb(255, 154, 31)]
      for (let i = 0; i < bricks.length; i++) if (bricks[i].alive) brick(bricks[i].x, bricks[i].y, 52, 22, colors[i % colors.length])
      brick(px - 52, 424, 104, 16, rgb(244, 247, 251))
      brick(x - 10, y - 10, 20, 20, rgb(255, 210, 63))
    })
  })
}
`,
  platformer: `
function mount() {
  beginPlay(function () {
    let x = 40
    let y = 320
    let vy = 0
    let score = 0
    let got = false
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      const run = controls.x || 0.45
      x += run * CONFIG.speed * step
      if ((controls.act || controls.y < 0) && y >= 319) vy = -CONFIG.jump
      vy += CONFIG.gravity * step
      y += vy * step
      if (y > 320 && x < 300) { y = 320; vy = 0 }
      if (!got && x > 180) {
        got = true
        score += RULES.scoreCoin()
        award(score)
      }
      if (y > 460 || x > 460) finish(score)
    })
    onDraw(function () {
      ground(0, 332, 300, 36)
      ground(360, 332, 120, 36)
      if (!got && !tileSprite(9, 172, 284, 40, 40)) stamp(THEME.sprites.coin, 176, 284, 16)
      if (!cast(0, x - 28, y - 64, 72)) stamp(THEME.sprites.hero, x - 20, y - 48, 22)
    })
  })
}
`,
  'endless-runner': `
function mount() {
  beginPlay(function () {
    let y = 300
    let vy = 0
    let score = 0
    const hurdles = [{ x: 460, passed: false }]
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      if ((controls.act || controls.y < 0 || pointer.down) && y >= 299) vy = -CONFIG.jump
      vy += CONFIG.gravity * step
      y = Math.min(300, y + vy * step)
      for (const hurdle of hurdles) {
        hurdle.x -= CONFIG.speed * step
        if (!hurdle.passed && hurdle.x < 80) {
          if (y < 250) {
            hurdle.passed = true
            score += RULES.scoreHurdle()
            award(score)
          } else finish(score)
        }
      }
    })
    onDraw(function () {
      ground(0, 318, 480, 40)
      if (!cast(2, 40, y - 56, 72)) stamp(THEME.sprites.hero, 48, y - 36, 22)
      for (const hurdle of hurdles) if (!tileSprite(4, hurdle.x, 268, 48, 48)) stamp(THEME.sprites.hurdle, hurdle.x, 276, 20)
    })
  })
}
`,
  'space-shooter': `
function mount() {
  beginPlay(function () {
    let px = 240
    let cool = 0
    let score = 0
    const bullets = []
    const enemies = [{ x: 240, y: 70, alive: true }]
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      px = Math.max(24, Math.min(456, px + controls.x * CONFIG.speed * step))
      if (pointer.down && pointer.y < 400) px = Math.max(24, Math.min(456, pointer.x))
      cool -= step
      if (cool <= 0 || controls.act) {
        bullets.push({ x: px, y: 390 })
        cool = 0.4
      }
      for (const bullet of bullets) bullet.y -= CONFIG.bullet * step
      for (const enemy of enemies) {
        if (!enemy.alive) continue
        enemy.y += CONFIG.enemy * step
        for (const bullet of bullets) {
          if (Math.abs(bullet.x - enemy.x) < 22 && Math.abs(bullet.y - enemy.y) < 22) {
            enemy.alive = false
            score += RULES.scoreHit()
            award(score)
          }
        }
        if (enemy.y > 430) finish(score)
      }
    })
    onDraw(function () {
      brick(px - 64, 348, 128, 44, rgb(255, 210, 63))
      brick(px - 22, 316, 44, 36, rgb(125, 215, 255))
      brick(px - 18, 324, 36, 18, rgb(255, 248, 230))
      brick(px - 78, 372, 32, 36, rgb(255, 46, 99))
      brick(px + 46, 372, 32, 36, rgb(255, 46, 99))
      for (const bullet of bullets) brick(bullet.x - 5, bullet.y, 12, 32, rgb(255, 248, 230))
      for (const enemy of enemies) if (enemy.alive) {
        brick(enemy.x - 58, enemy.y + 6, 116, 48, rgb(255, 46, 99))
        brick(enemy.x - 24, enemy.y + 18, 48, 20, rgb(255, 210, 63))
        brick(enemy.x - 70, enemy.y + 16, 22, 22, rgb(125, 215, 255))
        brick(enemy.x + 48, enemy.y + 16, 22, 22, rgb(125, 215, 255))
        if (!cast(4, enemy.x - 48, enemy.y - 52, 96)) stamp(THEME.sprites.hero, enemy.x - 36, enemy.y, 28)
      }
    })
  })
}
`,
  'maze-chomper': `
function mount() {
  beginPlay(function () {
    const layout = [
      '##########',
      '#P..o....#',
      '#.##.##.##',
      '#....G...#',
      '##########'
    ]
    const rows = layout.length
    const cols = layout[0].length
    let px = 1
    let py = 1
    let gx = 5
    let gy = 3
    let score = 0
    let acc = 0
    let gacc = 0
    const dots = {}
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (layout[y][x] === '.' || layout[y][x] === 'o') dots[x + ',' + y] = true
    function wall(x, y) { return layout[y][x] === '#' }
    function stepToward(from, to) {
      const options = [{ x: from.x + 1, y: from.y }, { x: from.x - 1, y: from.y }, { x: from.x, y: from.y + 1 }, { x: from.x, y: from.y - 1 }]
      options.sort(function (a, b) {
        return Math.abs(a.x - to.x) + Math.abs(a.y - to.y) - (Math.abs(b.x - to.x) + Math.abs(b.y - to.y))
      })
      for (const next of options) if (!wall(next.x, next.y)) return next
      return from
    }
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      acc += step
      gacc += step
      const controls = pad()
      if (acc > 0.16) {
        acc = 0
        let nx = px
        let ny = py
        if (controls.x) nx += controls.x > 0 ? 1 : -1
        else if (controls.y) ny += controls.y > 0 ? 1 : -1
        if (!wall(nx, ny)) { px = nx; py = ny }
        const key = px + ',' + py
        if (dots[key]) {
          delete dots[key]
          score += RULES.scorePellet()
          award(score)
        }
      }
      if (gacc > CONFIG.ghostMs / 1000) {
        gacc = 0
        const next = stepToward({ x: gx, y: gy }, { x: px, y: py })
        gx = next.x
        gy = next.y
        if (gx === px && gy === py) finish(score)
      }
    })
    onDraw(function () {
      const cw = 44
      const ch = 68
      const ox = Math.round((480 - cols * cw) / 2)
      const oy = Math.round((480 - rows * ch) / 2)
      brick(ox - 10, oy - 10, cols * cw + 20, rows * ch + 20, rgb(10, 18, 56))
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (layout[y][x] === '#') brick(ox + x * cw + 3, oy + y * ch + 3, cw - 6, ch - 6, rgb(79, 179, 255))
        else if (dots[x + ',' + y]) drawCircle({ pos: vec2(ox + x * cw + cw / 2, oy + y * ch + ch / 2), radius: 9, color: rgb(255, 210, 63) })
      }
      if (!cast(6, ox + px * cw - 8, oy + py * ch + 4, 60)) stamp(THEME.sprites.hero, ox + px * cw, oy + py * ch, 28)
      if (!cast(8, ox + gx * cw - 8, oy + gy * ch + 4, 60)) stamp(THEME.sprites.chaser, ox + gx * cw, oy + gy * ch, 28)
    })
  })
}
`,
  'jump-up': `
function mount() {
  beginPlay(function () {
    let x = 240
    let y = 360
    let vy = -CONFIG.jump
    let score = 0
    const plats = [{ x: 240, y: 390, got: true }, { x: 240, y: 250, got: false }, { x: 180, y: 120, got: false }]
    onUpdate(function () {
      const step = Math.min(dt(), 0.05)
      const controls = pad()
      x = Math.max(30, Math.min(450, x + controls.x * 180 * step))
      vy += CONFIG.gravity * step
      y += vy * step
      if (y > 470) finish(score)
      for (const plat of plats) {
        if (vy > 0 && Math.abs(x - plat.x) < 56 && y > plat.y - 10 && y < plat.y + 18) {
          y = plat.y
          vy = -CONFIG.jump
          if (!plat.got) {
            plat.got = true
            score += RULES.scorePlatform()
            award(score)
          }
        }
      }
    })
    onDraw(function () {
      for (const plat of plats) {
        if (!tileSprite(4, plat.x - 46, plat.y - 6, 92, 22)) brick(plat.x - 46, plat.y - 4, 92, 16, rgb(255, 154, 31))
      }
      if (!cast(6, x - 28, y - 64, 64)) stamp(THEME.sprites.hero, x - 24, y - 52, 20)
    })
  })
}
`,
  'match-3': `
function mount() {
  beginPlay(function () {
    const cols = CONFIG.cols
    const rows = CONFIG.rows
    const grid = []
    for (let y = 0; y < rows; y++) {
      grid.push([])
      for (let x = 0; x < cols; x++) grid[y].push((x + y) % CONFIG.kinds)
    }
    grid[1][2] = 0
    grid[1][3] = 2
    grid[1][4] = 2
    let cursor = 1
    let score = 0
    let time = 0
    let swapped = false
    let xWas = 0
    const tones = [THEME.palette.k0 || THEME.palette.accent, THEME.palette.k1 || THEME.palette.ink, THEME.palette.k2 || '#ff5a7a', THEME.palette.k3 || '#ffb020', THEME.palette.accent]
    function clearMatches() {
      const kill = {}
      let gained = 0
      for (let y = 0; y < rows; y++) {
        let run = 1
        for (let x = 1; x <= cols; x++) {
          if (x < cols && grid[y][x] === grid[y][x - 1]) run += 1
          else {
            if (run >= 3) for (let i = 0; i < run; i++) kill[(x - 1 - i) + ',' + y] = true
            run = 1
          }
        }
      }
      for (const key of Object.keys(kill)) {
        const parts = key.split(',')
        grid[Number(parts[1])][Number(parts[0])] = (grid[Number(parts[1])][Number(parts[0])] + 1) % CONFIG.kinds
        gained += 1
      }
      if (gained) {
        score += RULES.scoreGroup(gained)
        award(score)
      }
      return gained
    }
    function swapRight() {
      const row = grid[1]
      const tmp = row[cursor]
      row[cursor] = row[cursor + 1]
      row[cursor + 1] = tmp
      if (!clearMatches()) {
        row[cursor + 1] = row[cursor]
        row[cursor] = tmp
      }
    }
    onUpdate(function () {
      time += Math.min(dt(), 0.05)
      const controls = pad()
      if (controls.x > 0 && xWas <= 0) cursor = Math.min(cols - 2, cursor + 1)
      if (controls.x < 0 && xWas >= 0) cursor = Math.max(0, cursor - 1)
      xWas = controls.x
      if (!swapped && (controls.act || time > 0.05)) {
        swapped = true
        swapRight()
      }
    })
    onDraw(function () {
      const cell = Math.floor(360 / Math.max(cols, rows))
      const ox = Math.floor((480 - cols * cell) / 2)
      const oy = 78
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const gem = ink(tones[grid[y][x] % tones.length])
        brick(ox + x * cell + 6, oy + y * cell + 6, cell - 14, cell - 14, gem)
      }
      drawRect({ pos: vec2(ox + cursor * cell + 8, oy + cell - 8), width: cell - 16, height: 6, color: rgb(27, 27, 47) })
    })
  })
}
`
}
