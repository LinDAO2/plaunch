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
- One yellow Play control (${CANDY.play} with a ${CANDY.playEdge} bottom edge). No sign-in. Title in a chunky display face. Score in a top-center pill with tabular numerals.
- Juice: squash to 1.2 by 0.8 for 80ms on jump and land, a floating +N that rises 24px in 500ms, particles on every clear, shake of at most 6px, confetti and a 1.2s count-up when the run ends, plus a near-miss line.
- Word tiles flip for 250ms, staggered 100ms. Hit, present, and miss stay ${CANDY.hit}, ${CANDY.present}, and ${CANDY.miss}.
- Share text is the score, or a spoiler-free mark grid. Never include a secret word, answer, or spoiler.
- Touch targets are at least 44px. Idle controls stay faint and brighten while pressed.`
