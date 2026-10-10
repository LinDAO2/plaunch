export class HttpError extends Error {
  constructor(status, message, code) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code || undefined
  }
}

export function httpError(status, message, code) {
  return new HttpError(status, message, code)
}
