// Every API error uses this envelope. `code` is also the client's i18n key (errors.<code>).
export function sendError(res, status, code, message) {
  res.status(status).json({ ok: false, error: { code, message } })
}

export const notImplemented = (req, res) => sendError(res, 501, 'NOT_IMPLEMENTED', 'Not implemented yet')
