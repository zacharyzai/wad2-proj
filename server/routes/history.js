// Owner: Sheen Hern. Replace the stub with real endpoints.
import { Router } from 'express'
import { notImplemented } from '../errors.js'

const router = Router()
router.all('/{*rest}', notImplemented)

export default router
