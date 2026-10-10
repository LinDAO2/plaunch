const AXES = ['pattern', 'movement', 'controls', 'win', 'primitives']

export function specAxes(spec) {
  const primitives = Array.isArray(spec?.primitives) && spec.primitives.length ? spec.primitives.slice().sort() : ['fall']
  return {
    pattern: spec?.spawn?.pattern || '',
    movement: spec?.movement || '',
    controls: spec?.controls?.scheme || '',
    win: spec?.rules?.win || '',
    primitives: primitives.join('+')
  }
}

export function axisDifference(left, right) {
  const a = specAxes(left)
  const b = specAxes(right)
  return AXES.filter((axis) => a[axis] !== b[axis]).length
}

export function specsAreDistinct(specs, minimum = 3) {
  if (!Array.isArray(specs) || specs.length < 4) return false
  for (let i = 0; i < specs.length; i++) {
    for (let j = i + 1; j < specs.length; j++) {
      if (axisDifference(specs[i], specs[j]) < minimum) return false
    }
  }
  return true
}
