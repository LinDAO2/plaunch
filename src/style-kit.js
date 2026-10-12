// Shared candy-arcade direction from the v1.3.1 brief. 2D games, Blocks HUD,
// imported-game chrome, and model prompts read these values. Launchpad chrome
// stays on the X-like neutrals in public/style.css.

export const CANDY = {
  outline: '#1B1B2F',
  play: '#FFD23F',
  playEdge: '#B8860B',
  ink: '#1B1B2F',
  paper: '#F4F7FB',
  hit: '#3FB950',
  present: '#E3B341',
  miss: '#3A3F47',
  hazard: '#FF2E63',
  dayZenith: '#4FB3FF',
  dayHorizon: '#CDEBFF',
  teamA: '#FF5A3C',
  teamB: '#2F7BFF'
}

export const STYLE_GUIDE = `Art direction for every game:
- Candy arcade. Flat shapes, a 3px outline in ${CANDY.outline}, a short drop shadow, rounded forms.
- Family colors: sky ${CANDY.dayZenith} to ${CANDY.dayHorizon}, hot ${CANDY.teamA}, blue ${CANDY.teamB}, pickup ${CANDY.play}, hit ${CANDY.hit}, present ${CANDY.present}, miss ${CANDY.miss}, hazard ${CANDY.hazard}.
- One yellow Play control (${CANDY.play} with a ${CANDY.playEdge} bottom edge). No sign-in.
- Juice: squash on jump, a floating +N, particles on a clear, a short shake, confetti when the run ends.
- Share text is the score only. Never include a secret word, answer, or spoiler.
- In-game titles use a chunky display face. Numerals are tabular. The launchpad chrome is separate.`
