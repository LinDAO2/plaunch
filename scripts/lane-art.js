/* Original flat shapes for Lane Racer. Drawn in the page so the build does not ship the bitmap sheet. */
(function () {
  var sprites = {
    PALM_TREE: [5, 5, 215, 540],
    BILLBOARD08: [230, 5, 385, 265],
    TREE1: [625, 5, 360, 360],
    DEAD_TREE1: [5, 555, 135, 332],
    BILLBOARD09: [150, 555, 328, 282],
    BOULDER3: [230, 280, 320, 220],
    COLUMN: [995, 5, 200, 315],
    BILLBOARD01: [625, 375, 300, 170],
    BILLBOARD06: [488, 555, 298, 190],
    BILLBOARD05: [5, 897, 298, 190],
    BILLBOARD07: [313, 897, 298, 190],
    BOULDER2: [621, 897, 298, 140],
    TREE2: [1205, 5, 282, 295],
    BILLBOARD04: [1205, 310, 268, 170],
    DEAD_TREE2: [1205, 490, 150, 260],
    BOULDER1: [1205, 760, 168, 248],
    BUSH1: [5, 1097, 240, 155],
    CACTUS: [929, 897, 235, 118],
    BUSH2: [255, 1097, 232, 152],
    BILLBOARD03: [5, 1262, 230, 220],
    BILLBOARD02: [245, 1262, 215, 220],
    STUMP: [995, 330, 195, 140],
    SEMI: [1365, 490, 122, 144],
    TRUCK: [1365, 644, 100, 78],
    CAR03: [1383, 760, 88, 55],
    CAR02: [1383, 825, 80, 59],
    CAR04: [1383, 894, 80, 57],
    CAR01: [1205, 1018, 80, 56],
    PLAYER_UPHILL_LEFT: [1383, 961, 80, 45],
    PLAYER_UPHILL_STRAIGHT: [1295, 1018, 80, 45],
    PLAYER_UPHILL_RIGHT: [1385, 1018, 80, 45],
    PLAYER_LEFT: [995, 480, 80, 41],
    PLAYER_STRAIGHT: [1085, 480, 80, 41],
    PLAYER_RIGHT: [995, 531, 80, 41]
  }

  function clip(ctx, box, draw) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(box[0], box[1], box[2], box[3])
    ctx.clip()
    draw(ctx, box[0], box[1], box[2], box[3])
    ctx.restore()
  }

  function fill(ctx, color) {
    ctx.fillStyle = color
  }

  function tree(ctx, x, y, w, h, leaf) {
    fill(ctx, '#6a4424')
    ctx.fillRect(x + w * 0.44, y + h * 0.52, w * 0.12, h * 0.48)
    fill(ctx, leaf)
    ctx.beginPath()
    ctx.moveTo(x + w * 0.5, y + h * 0.04)
    ctx.lineTo(x + w * 0.08, y + h * 0.62)
    ctx.lineTo(x + w * 0.92, y + h * 0.62)
    ctx.closePath()
    ctx.fill()
  }

  function palm(ctx, x, y, w, h) {
    fill(ctx, '#6a4424')
    ctx.fillRect(x + w * 0.46, y + h * 0.34, w * 0.08, h * 0.62)
    fill(ctx, '#178a3a')
    var top = y + h * 0.36
    var cx = x + w * 0.5
    ;[[-0.42, 0.16], [-0.2, 0.02], [0, -0.08], [0.2, 0.02], [0.42, 0.16]].forEach(function (leaf) {
      ctx.beginPath()
      ctx.moveTo(cx, top)
      ctx.lineTo(cx + w * leaf[0], top + h * leaf[1])
      ctx.lineTo(cx + w * leaf[0] * 0.35, top + h * 0.08)
      ctx.closePath()
      ctx.fill()
    })
  }

  function dead(ctx, x, y, w, h) {
    fill(ctx, '#5c4030')
    ctx.fillRect(x + w * 0.42, y + h * 0.28, w * 0.16, h * 0.7)
    ctx.fillRect(x + w * 0.18, y + h * 0.34, w * 0.28, h * 0.08)
    ctx.fillRect(x + w * 0.54, y + h * 0.42, w * 0.28, h * 0.08)
  }

  function bush(ctx, x, y, w, h) {
    fill(ctx, '#1f8a3c')
    ctx.beginPath()
    ctx.ellipse(x + w * 0.5, y + h * 0.62, w * 0.42, h * 0.32, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function cactus(ctx, x, y, w, h) {
    fill(ctx, '#1c8f45')
    ctx.fillRect(x + w * 0.42, y + h * 0.2, w * 0.16, h * 0.75)
    ctx.fillRect(x + w * 0.18, y + h * 0.38, w * 0.28, h * 0.14)
    ctx.fillRect(x + w * 0.54, y + h * 0.48, w * 0.28, h * 0.14)
  }

  function rock(ctx, x, y, w, h) {
    fill(ctx, '#8d93a0')
    ctx.beginPath()
    ctx.ellipse(x + w * 0.5, y + h * 0.62, w * 0.4, h * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()
    fill(ctx, '#b7bcc6')
    ctx.beginPath()
    ctx.ellipse(x + w * 0.42, y + h * 0.5, w * 0.22, h * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function column(ctx, x, y, w, h) {
    fill(ctx, '#9aa0aa')
    ctx.fillRect(x + w * 0.28, y + h * 0.16, w * 0.44, h * 0.78)
    ctx.fillRect(x + w * 0.16, y + h * 0.08, w * 0.68, h * 0.1)
  }

  function stump(ctx, x, y, w, h) {
    fill(ctx, '#6a4424')
    ctx.fillRect(x + w * 0.28, y + h * 0.35, w * 0.44, h * 0.5)
    ctx.beginPath()
    ctx.ellipse(x + w * 0.5, y + h * 0.35, w * 0.28, h * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function sign(ctx, x, y, w, h, color) {
    fill(ctx, '#1a1c1f')
    ctx.fillRect(x + w * 0.16, y + h * 0.7, w * 0.08, h * 0.28)
    ctx.fillRect(x + w * 0.76, y + h * 0.7, w * 0.08, h * 0.28)
    fill(ctx, color)
    ctx.fillRect(x + w * 0.08, y + h * 0.08, w * 0.84, h * 0.58)
    fill(ctx, '#111')
    ctx.fillRect(x + w * 0.2, y + h * 0.28, w * 0.6, h * 0.1)
  }

  function car(ctx, x, y, w, h, color, lean) {
    var cabin = 0.34 + lean * 0.1
    fill(ctx, color)
    ctx.fillRect(x + w * 0.08, y + h * 0.42, w * 0.84, h * 0.32)
    ctx.fillRect(x + w * cabin, y + h * 0.16, w * 0.32, h * 0.28)
    fill(ctx, '#111')
    ctx.beginPath()
    ctx.arc(x + w * 0.28, y + h * 0.78, Math.max(2, h * 0.16), 0, Math.PI * 2)
    ctx.arc(x + w * 0.74, y + h * 0.78, Math.max(2, h * 0.16), 0, Math.PI * 2)
    ctx.fill()
  }

  function haul(ctx, x, y, w, h, color) {
    fill(ctx, color)
    ctx.fillRect(x + w * 0.06, y + h * 0.18, w * 0.62, h * 0.48)
    ctx.fillRect(x + w * 0.66, y + h * 0.36, w * 0.28, h * 0.3)
    fill(ctx, '#111')
    ctx.beginPath()
    ctx.arc(x + w * 0.24, y + h * 0.78, Math.max(2, h * 0.14), 0, Math.PI * 2)
    ctx.arc(x + w * 0.78, y + h * 0.78, Math.max(2, h * 0.14), 0, Math.PI * 2)
    ctx.fill()
  }

  var sheet = document.createElement('canvas')
  sheet.width = 1500
  sheet.height = 1560
  var pen = sheet.getContext('2d')
  var signs = ['#e6ff3a', '#7ad7ff', '#ff5a7a', '#ffb020', '#ffffff', '#b6ff3a', '#d7dbe0', '#7dffb3', '#ffd0e0']
  var signNames = ['BILLBOARD01', 'BILLBOARD02', 'BILLBOARD03', 'BILLBOARD04', 'BILLBOARD05', 'BILLBOARD06', 'BILLBOARD07', 'BILLBOARD08', 'BILLBOARD09']
  clip(pen, sprites.PALM_TREE, palm)
  clip(pen, sprites.TREE1, function (ctx, x, y, w, h) { tree(ctx, x, y, w, h, '#178a3a') })
  clip(pen, sprites.TREE2, function (ctx, x, y, w, h) { tree(ctx, x, y, w, h, '#0f6b2c') })
  clip(pen, sprites.DEAD_TREE1, dead)
  clip(pen, sprites.DEAD_TREE2, dead)
  clip(pen, sprites.BUSH1, bush)
  clip(pen, sprites.BUSH2, bush)
  clip(pen, sprites.CACTUS, cactus)
  clip(pen, sprites.BOULDER1, rock)
  clip(pen, sprites.BOULDER2, rock)
  clip(pen, sprites.BOULDER3, rock)
  clip(pen, sprites.COLUMN, column)
  clip(pen, sprites.STUMP, stump)
  signNames.forEach(function (name, index) {
    clip(pen, sprites[name], function (ctx, x, y, w, h) { sign(ctx, x, y, w, h, signs[index]) })
  })
  ;[
    ['CAR01', '#ff5a7a', 0],
    ['CAR02', '#7ad7ff', 0],
    ['CAR03', '#ffb020', 0],
    ['CAR04', '#ffffff', 0],
    ['PLAYER_STRAIGHT', '#e6ff3a', 0],
    ['PLAYER_LEFT', '#e6ff3a', -1],
    ['PLAYER_RIGHT', '#e6ff3a', 1],
    ['PLAYER_UPHILL_STRAIGHT', '#e6ff3a', 0],
    ['PLAYER_UPHILL_LEFT', '#e6ff3a', -1],
    ['PLAYER_UPHILL_RIGHT', '#e6ff3a', 1]
  ].forEach(function (item) {
    clip(pen, sprites[item[0]], function (ctx, x, y, w, h) { car(ctx, x, y, w, h, item[1], item[2]) })
  })
  clip(pen, sprites.SEMI, function (ctx, x, y, w, h) { haul(ctx, x, y, w, h, '#e7e9ea') })
  clip(pen, sprites.TRUCK, function (ctx, x, y, w, h) { haul(ctx, x, y, w, h, '#c45c26') })

  var sky = document.createElement('canvas')
  sky.width = 1285
  sky.height = 1465
  var bg = sky.getContext('2d')
  bg.fillStyle = '#7ecbff'
  bg.fillRect(5, 495, 1280, 480)
  bg.fillStyle = '#ffffff'
  for (var cloud = 0; cloud < 4; cloud++) {
    var cx = 80 + cloud * 320
    bg.fillRect(cx, 620, 140, 36)
    bg.fillRect(cx + 30, 600, 70, 28)
  }
  bg.fillStyle = '#8fd18a'
  for (var hill = 0; hill < 6; hill++) {
    var hx = 5 + hill * 220
    bg.beginPath()
    bg.moveTo(hx, 430)
    bg.lineTo(hx + 110, 80 + (hill % 3) * 40)
    bg.lineTo(hx + 220, 430)
    bg.closePath()
    bg.fill()
  }
  bg.fillStyle = '#146b32'
  for (var grove = 0; grove < 8; grove++) {
    var tx = 20 + grove * 160
    bg.beginPath()
    bg.moveTo(tx + 40, 1040)
    bg.lineTo(tx, 1400)
    bg.lineTo(tx + 80, 1400)
    bg.closePath()
    bg.fill()
  }

  window.PG_IMAGES = {
    background: sky.toDataURL('image/png'),
    sprites: sheet.toDataURL('image/png')
  }
})();
