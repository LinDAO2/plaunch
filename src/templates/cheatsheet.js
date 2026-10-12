export const KAPLAY_CHEATSHEET = `Kaplay 3001 games in this library already boot, draw, and take input.
You do not return HTML or new scenes. You return JSON replacements for editable data only.
Useful facts about the engine the templates already call:
- kaplay({ width: 480, height: 480, stretch, letterbox, crisp }) fills the 480 embed and scales up.
- scene(name, fn), go(name), onUpdate(fn), onDraw(fn), dt() in seconds.
- drawRect({ pos: vec2(x, y), width, height, color: rgb(r, g, b) }).
- add([text(str, { size }), pos(x, y), anchor("center"), color(rgb)]).
- Keys: arrows, wasd, space, enter. Touch and mouse set a pointer. A bottom pad is left / action / right.
- Scores use parent.postMessage({ type: "playground-score", points }, "*") and nowhere else.
Do not add fetch, WebSocket, eval, Function, workers, or URLs. Sprites are tiny string grids such as [".a.","aaa"] using palette letters.
Keep the candy-arcade family: outline #1B1B2F, Play yellow #FFD23F, sky #4FB3FF to #CDEBFF, hit #3FB950, present #E3B341, miss #3A3F47. Share text is the score only.`

export const PICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['templateId', 'confidence', 'changes'],
  properties: {
    templateId: { type: 'string' },
    confidence: { type: 'number' },
    changes: { type: 'array', items: { type: 'string' } }
  }
}

export const EDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    CONFIG: { type: 'object', additionalProperties: true },
    THEME: { type: 'object', additionalProperties: true },
    RULES: { type: 'object', additionalProperties: true }
  }
}
