import { HttpError } from './errors.js'
import { cleanText, validateGameInput } from './validate.js'

export const TEMPLATE_NOTICE = 'This preview uses a template matcher, not an AI model. Connect an AI provider for original generated games.'

export function generateTemplate(prompt) {
  const p = cleanText(prompt, 600).toLowerCase()
  if (p.length < 6) throw new HttpError(400, 'Describe your game in more detail', 'validation_error')
  const type = /dodge|meteor|avoid|falling|obstacle|surviv/.test(p) ? 'dodge'
    : /reaction|reflex|quick|green|signal/.test(p) ? 'reaction'
      : /guess|number|mystery|higher|lower|trivia/.test(p) ? 'guess'
        : 'tap'
  const words = cleanText(prompt, 600).replace(/\s+/g, ' ').split(' ').filter(Boolean).slice(0, 5).join(' ')
  const title = /(space|meteor|alien)/.test(p) ? 'Cosmic Rush'
    : /(cat|kitten)/.test(p) ? 'Cat Dash'
      : /(coffee|cafe)/.test(p) ? 'Caffeine Rush'
        : type === 'reaction' ? 'Flash Reflex'
          : type === 'guess' ? 'Mystery Number'
            : type === 'dodge' ? 'Dodge Dash'
              : 'Tap Frenzy'
  const game = validateGameInput({
    name: title,
    description: `Inspired by your prompt: ${words}`,
    type,
    duration: type === 'dodge' ? 30 : 15,
    accent: type === 'dodge' ? '#ff779e' : '#a88bff'
  })
  return {
    ...game,
    generation: 'rule-based-template',
    notice: TEMPLATE_NOTICE
  }
}
