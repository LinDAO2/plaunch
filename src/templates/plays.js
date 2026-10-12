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
    let guess = ''
    let time = 0
    let done = false
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    function submit(text) {
      if (done) return
      const word = (text || guess || 'crane').toLowerCase().slice(0, length).padEnd(length, 'a')
      const score = RULES.scoreGuess(word, answer)
      rows.push(word)
      guess = ''
      award(score)
      if (word === answer || rows.length >= CONFIG.maxGuesses) {
        done = true
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
          const mark = rows[r] ? (rows[r][c] === answer[c] ? '#3FB950' : (answer.indexOf(rows[r][c]) >= 0 ? '#E3B341' : '#3A3F47')) : '#3A3F47'
          drawRect({ pos: vec2(40 + c * 40, 70 + r * 36), width: 34, height: 32, color: ink(mark) })
          if (ch) drawText({ text: ch.toUpperCase(), size: 16, pos: vec2(50 + c * 40, 76 + r * 36), color: ink(THEME.palette.bg) })
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
      const cell = Math.min(22, Math.floor(360 / rows), Math.floor(280 / cols))
      const ox = Math.floor((480 - cols * cell) / 2)
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x]) {
        drawRect({ pos: vec2(ox + x * cell, 36 + y * cell), width: cell - 1, height: cell - 1, color: ink(THEME.palette.accent) })
      }
      for (const spot of cells(piece)) {
        drawRect({ pos: vec2(ox + spot[0] * cell, 36 + spot[1] * cell), width: cell - 1, height: cell - 1, color: ink(THEME.palette.b || '#ffffff') })
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
      const cell = Math.min(22, Math.floor(360 / rows))
      const ox = Math.floor((480 - cols * cell) / 2)
      stamp(THEME.sprites.fruit, ox + food.x * cell, 40 + food.y * cell, Math.max(4, cell / 3))
      for (const part of snake) drawRect({ pos: vec2(ox + part.x * cell, 40 + part.y * cell), width: cell - 2, height: cell - 2, color: ink(THEME.palette.accent) })
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
      const cell = Math.floor(320 / size)
      const ox = Math.floor((480 - size * cell) / 2)
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        drawRect({ pos: vec2(ox + x * cell, 60 + y * cell), width: cell - 6, height: cell - 6, color: ink(grid[y][x] ? THEME.palette.accent : THEME.palette.mute) })
        if (grid[y][x]) drawText({ text: String(grid[y][x]), size: 18, pos: vec2(ox + x * cell + 12, 70 + y * cell), color: ink(THEME.palette.bg) })
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
      stamp(THEME.sprites.bird, 70, y, 10)
      for (const pipe of pipes) {
        drawRect({ pos: vec2(pipe.x, 0), width: 46, height: 140, color: ink(THEME.palette.accent) })
        drawRect({ pos: vec2(pipe.x, 140 + CONFIG.gap), width: 46, height: 260, color: ink(THEME.palette.accent) })
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
      for (const brick of bricks) if (brick.alive) drawRect({ pos: vec2(brick.x, brick.y), width: 46, height: 16, color: ink(THEME.palette.accent) })
      drawRect({ pos: vec2(px - 36, 436), width: 72, height: 12, color: ink(THEME.palette.ink) })
      drawRect({ pos: vec2(x - 6, y - 6), width: 12, height: 12, color: ink(THEME.palette.b || '#ffffff') })
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
      drawRect({ pos: vec2(0, 348), width: 300, height: 16, color: ink(THEME.palette.mute) })
      drawRect({ pos: vec2(360, 348), width: 120, height: 16, color: ink(THEME.palette.mute) })
      if (!got) stamp(THEME.sprites.coin, 190, 300, 8)
      stamp(THEME.sprites.hero, x, y, 10)
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
      drawRect({ pos: vec2(0, 340), width: 480, height: 12, color: ink(THEME.palette.mute) })
      stamp(THEME.sprites.hero, 70, y, 12)
      for (const hurdle of hurdles) stamp(THEME.sprites.hurdle, hurdle.x, 300, 12)
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
      stamp(THEME.sprites.ship, px - 16, 400, 10)
      for (const bullet of bullets) drawRect({ pos: vec2(bullet.x - 2, bullet.y), width: 4, height: 12, color: ink(THEME.palette.ink) })
      for (const enemy of enemies) if (enemy.alive) stamp(THEME.sprites.hero, enemy.x - 16, enemy.y, 10)
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
      const cell = CONFIG.cell
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        if (layout[y][x] === '#') drawRect({ pos: vec2(20 + x * cell, 50 + y * cell), width: cell - 2, height: cell - 2, color: ink(THEME.palette.mute) })
        else if (dots[x + ',' + y]) drawRect({ pos: vec2(28 + x * cell, 58 + y * cell), width: 8, height: 8, color: ink(THEME.palette.ink) })
      }
      stamp(THEME.sprites.hero, 20 + px * cell, 50 + py * cell, cell / 4)
      stamp(THEME.sprites.chaser, 20 + gx * cell, 50 + gy * cell, cell / 4)
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
      for (const plat of plats) drawRect({ pos: vec2(plat.x - 40, plat.y), width: 80, height: 10, color: ink(THEME.palette.accent) })
      stamp(THEME.sprites.hero, x - 16, y - 28, 8)
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
      const cell = Math.floor(300 / Math.max(cols, rows))
      const ox = Math.floor((480 - cols * cell) / 2)
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        drawRect({ pos: vec2(ox + x * cell, 70 + y * cell), width: cell - 4, height: cell - 4, color: ink(tones[grid[y][x] % tones.length]) })
      }
      drawRect({ pos: vec2(ox + cursor * cell, 70 + cell), width: cell - 4, height: 4, color: ink(THEME.palette.ink) })
    })
  })
}
`
}
