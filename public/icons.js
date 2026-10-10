const D = {
  play: 'M4 2.5v11l9-5.5z',
  copy: 'M6 2h7v2h2v10H6V2zm2 2v8h5V4H8zM3 5h2v9h7v2H3V5z',
  share: 'M3 8h6V5l5 4-5 4V10H3V8z'
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '16')
  svg.setAttribute('height', '16')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', D[name] || D.play)
  path.setAttribute('fill', 'currentColor')
  svg.append(path)
  return svg
}
