import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { bundleFiles, inspectImport } from '../src/imports/bundle.js'
import { CURATED } from '../src/imports/catalog.js'
import { wantsKeyboard, wrapDocument } from '../src/imports/wrapper.js'

const SRC = process.env.PG_SRC || '/tmp/pg-src/files'
const OUT = path.join(process.cwd(), 'imports')

const CC0 = `CC0 1.0 Universal

You're free to use this game and code in any project, personal or commercial. There's no need to ask permission before using these. Giving attribution is not required, but appreciated.

Christopher Straker dedicated the original gist under CC0 1.0.
`

function b64(buf) {
  return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
}

async function filesUnder(dir, names) {
  const out = {}
  for (const name of names) {
    out[name] = await readFile(path.join(dir, name))
  }
  return out
}

async function build2048() {
  const dir = path.join(SRC, '2048')
  const names = [
    'index.html',
    'style/main.css',
    'js/bind_polyfill.js',
    'js/classlist_polyfill.js',
    'js/animframe_polyfill.js',
    'js/keyboard_input_manager.js',
    'js/html_actuator.js',
    'js/grid.js',
    'js/tile.js',
    'js/local_storage_manager.js',
    'js/game_manager.js',
    'js/application.js'
  ]
  const files = await filesUnder(dir, names)
  let html = files['index.html'].toString('utf8')
  html = html.replace(/<hr>\s*<p>[\s\S]*?<\/p>\s*<hr>\s*<p>[\s\S]*?<\/p>/, '')
  html = html.replace(/<link\b[^>]*>/gi, '')
  files['index.html'] = html
  let css = files['style/main.css'].toString('utf8')
  css = css.replace(/@import url\(fonts\/clear-sans\.css\);\s*/, '')
  css = css.replace('"Clear Sans", ', '')
  files['style/main.css'] = css
  return { files, entry: 'index.html', scoreSelector: '.score-container', licenseName: 'LICENSE.txt', licenseFrom: path.join(dir, 'LICENSE.txt') }
}

async function buildRacer() {
  const dir = path.join(SRC, 'racer')
  let html = (await readFile(path.join(dir, 'v4.final.html'), 'utf8'))
  html = html.replace(/<title>[^<]*<\/title>/, '<title>Lane Racer</title>')
  html = html.replace('<option selected value=\'high\'>High (1024x768)</option>', '<option value=\'high\'>High (1024x768)</option>')
  html = html.replace('<option value=\'low\'>Low (480x360)</option>', '<option selected value=\'low\'>Low (480x360)</option>')
  html = html.replace('var width          = 1024;', 'var width          = 480;')
  html = html.replace('var height         = 768;', 'var height         = 360;')
  html = html.replace(/<audio[\s\S]*?<\/audio>/, '')
  html = html.replace('<script src="stats.js"></script>', '')
  html = html.replace('</head>', '<style>#controls{display:none!important}</style></head>')
  const bg = b64(await readFile(path.join(dir, 'images/background.png')))
  const sprites = b64(await readFile(path.join(dir, 'images/sprites.png')))
  html = html.replace(
    '<script src="common.js"></script>',
    `<script>window.PG_IMAGES={background:${JSON.stringify(bg)},sprites:${JSON.stringify(sprites)}};</script>\n<script src="common.js"></script>`
  )
  let common = (await readFile(path.join(dir, 'common.js'), 'utf8'))
  common = common.replace(
    'result[n].src = "images/" + name + ".png";',
    'result[n].src = window.PG_IMAGES[name];'
  )
  common = common.replace(
    `playMusic: function() {
    var music = Dom.get('music');
    music.loop = true;`,
    `playMusic: function() {
    var music = Dom.get('music');
    if (!music) return;
    music.loop = true;`
  )
  common = common.replace(
    `stats: function(parentId, id) { // construct mr.doobs FPS counter - along with friendly good/bad/ok message box

    var result = new Stats();
    result.domElement.id = id || 'stats';
    Dom.get(parentId).appendChild(result.domElement);

    var msg = document.createElement('div');
    msg.style.cssText = "border: 2px solid gray; padding: 5px; margin-top: 5px; text-align: left; font-size: 1.15em; text-align: right;";
    msg.innerHTML = "Your canvas performance is ";
    Dom.get(parentId).appendChild(msg);

    var value = document.createElement('span');
    value.innerHTML = "...";
    msg.appendChild(value);

    setInterval(function() {
      var fps   = result.current();
      var ok    = (fps > 50) ? 'good'  : (fps < 30) ? 'bad' : 'ok';
      var color = (fps > 50) ? 'green' : (fps < 30) ? 'red' : 'gray';
      value.innerHTML       = ok;
      value.style.color     = color;
      msg.style.borderColor = color;
    }, 5000);
    return result;
  },`,
    `stats: function() {
    return { update: function () {}, current: function () { return 60; } };
  },`
  )
  const css = await readFile(path.join(dir, 'common.css'))
  return {
    files: { 'index.html': html, 'common.js': common, 'common.css': css },
    entry: 'index.html',
    scoreSelector: '#speed_value',
    licenseName: 'LICENSE',
    licenseFrom: path.join(dir, 'LICENSE')
  }
}

async function buildStack() {
  const dir = path.join(SRC, 'tetris')
  let html = (await readFile(path.join(dir, 'index.html'), 'utf8'))
  html = html.replace(/tetris/gi, (match) => (match[0] === 'T' ? 'Stack' : 'stack'))
  html = html.replace(/<title>[^<]*<\/title>/, '<title>Stack</title>')
  html = html.replace('<script src="stats.js"></script>', '<script>function Stats(){this.domElement=document.createElement("div");this.begin=this.end=this.update=function(){};}</script>')
  const texture = await readFile(path.join(dir, 'texture.jpg'))
  if (/tetris/i.test(html)) throw new Error('Stack still contains a tetris string')
  return {
    files: { 'index.html': html, 'texture.jpg': texture },
    entry: 'index.html',
    scoreSelector: '#score',
    licenseName: 'LICENSE',
    licenseFrom: path.join(dir, 'LICENSE')
  }
}

async function buildGist(file, title, patch) {
  let html = (await readFile(path.join(SRC, 'gists', file), 'utf8'))
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
  html = patch(html)
  return {
    files: { 'index.html': html },
    entry: 'index.html',
    scoreSelector: '',
    licenseText: CC0
  }
}

const BUILDERS = {
  'tile-2048': build2048,
  'lane-racer': buildRacer,
  'stack-blocks': buildStack,
  'grid-snake': () => buildGist('snake-snake.html', 'Grid Snake', (html) => html.replace(
    'snake.maxCells++;',
    `snake.maxCells++;
      if (!snake.score) snake.score = 0;
      snake.score += 1;
      if (window.Playground) Playground.submitScore(snake.score);`
  ).replace(
    'snake.maxCells = 4;',
    `snake.maxCells = 4;
        snake.score = 0;`
  )),
  'brick-bounce': () => buildGist('breakout-breakout.html', 'Brick Bounce', (html) => html.replace(
    'bricks.splice(i, 1);',
    `bricks.splice(i, 1);
      if (!window.__pgScore) window.__pgScore = 0;
      window.__pgScore += 10;
      if (window.Playground) Playground.submitScore(window.__pgScore);`
  )),
  'tower-bounce': () => buildGist('doodle-doodle-jump.html', 'Tower Bounce', (html) => html.replace(
    'doodle.dy = bounceVelocity;',
    `doodle.dy = bounceVelocity;
      if (!window.__pgScore) window.__pgScore = 0;
      window.__pgScore += 1;
      if (window.Playground) Playground.submitScore(window.__pgScore);`
  ))
}

for (const entry of CURATED) {
  const built = await BUILDERS[entry.id]()
  const bundled = bundleFiles(built.files, { entry: built.entry })
  if (!bundled.ok) throw new Error(`${entry.id}: ${bundled.errors.join('; ')}`)
  const html = wrapDocument(bundled.html, {
    keyboard: wantsKeyboard(bundled.html),
    author: entry.credit.author,
    license: entry.credit.license,
    scoreSelector: built.scoreSelector
  })
  const errors = inspectImport(html)
  if (errors.length) throw new Error(`${entry.id}: ${errors.join('; ')}`)
  if (entry.id === 'stack-blocks' && /tetris/i.test(html)) throw new Error('wrapped Stack still says tetris')
  const dir = path.join(OUT, entry.id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'game.html'), html)
  const license = built.licenseText || await readFile(built.licenseFrom, 'utf8')
  await writeFile(path.join(dir, built.licenseName || 'LICENSE'), license)
  await writeFile(path.join(dir, 'PIN.json'), JSON.stringify({
    id: entry.id,
    sha: entry.credit.sha,
    source: entry.credit.source,
    author: entry.credit.author,
    license: entry.credit.license
  }, null, 2) + '\n')
  console.log(entry.id, Buffer.byteLength(html))
}
