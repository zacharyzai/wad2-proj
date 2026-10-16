import { test } from 'node:test'
import assert from 'node:assert/strict'
import { takeDailyQuota } from '../middleware/rateLimit.js'

test('global daily cap stops after AI_DAILY_CAP scans', () => {
  process.env.AI_DAILY_CAP = '2'
  assert.equal(takeDailyQuota(), true)
  assert.equal(takeDailyQuota(), true)
  assert.equal(takeDailyQuota(), false)
})

test('chat has its own daily cap', () => {
  process.env.AI_CHAT_DAILY_CAP = '1'
  assert.equal(takeDailyQuota('chat'), true)
  assert.equal(takeDailyQuota('chat'), false)
})
