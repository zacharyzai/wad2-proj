// Log out must leave nothing of the last person behind on a shared device (Vitest, Week 10).
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAskStore } from '../src/stores/ask'
import { useScanStore } from '../src/stores/scan'

beforeEach(() => setActivePinia(createPinia()))

describe('forget on log out', () => {
  it('clears the Ask conversation', () => {
    const ask = useAskStore()
    ask.messages.push({ id: 0, q: 'When do I take Metformin?' })
    ask.forget()
    expect(ask.messages).toHaveLength(0)
  })

  it('stops a scan still being read, so its late reply is ignored', () => {
    const scan = useScanStore()
    scan.reading = 'loading'
    scan.pages = ['data:image/jpeg;base64,AAA']
    const id = ++scan.run // what ScanView does when it sends
    scan.forget()
    expect(scan.run).not.toBe(id) // ScanView checks `id !== run` when the reply arrives
    expect(scan.reading).toBe('idle')
    expect(scan.pages).toEqual([])
  })
})
