// Load test (Week 10): 20 seniors use the app at the same time, the normal load we expect, not a stress test.
// Run:  terminal 1: node load/server.js      terminal 2: k6 run load/senior-day.js
// Each virtual user signs up once, then keeps doing what a senior does: opens Home and Schedule, ticks a dose,
// checks a sample label and saves it to History, then reads a little (think time) before the next visit.
import http from 'k6/http'
import { check, sleep } from 'k6'

const API = 'http://localhost:3100/api'

export const options = {
  stages: [
    { duration: '20s', target: 20 }, // seniors arrive
    { duration: '1m', target: 20 }, // 20 at once, for a minute
    { duration: '10s', target: 0 }, // they leave
  ],
  // Pass/fail rules: under 1% errors, and 95% of requests answered in under half a second.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
}

const json = (token) => ({
  headers: {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  },
})
const today = () => new Date().toISOString().slice(0, 10)
let token = null // one account per virtual user, kept between its visits

export default function () {
  if (!token) {
    const email = `load-${__VU}-${Date.now()}@example.com`
    const res = http.post(
      `${API}/auth/signup`,
      JSON.stringify({
        name: `Load Senior ${__VU}`,
        email,
        password: 'teh-tarik-1952',
        dob: '1950-01-01',
        citizenship: 'birth',
        income: 'unsure',
      }),
      json(),
    )
    check(res, { 'signup 201': (r) => r.status === 201 })
    token = res.json('data.token')
  }
  const auth = json(token)

  check(http.get(`${API}/auth/me`, auth), { 'home: who am I 200': (r) => r.status === 200 })
  check(http.get(`${API}/schedule`, auth), { 'schedule 200': (r) => r.status === 200 })
  check(http.get(`${API}/doses?date=${today()}`, auth), {
    'today ticks 200': (r) => r.status === 200,
  })
  check(http.post(`${API}/doses`, JSON.stringify({ doseId: 'm1-morning', date: today() }), auth), {
    'tick a dose 200': (r) => r.status === 200,
  })

  const scan = http.post(`${API}/scan`, JSON.stringify({ sampleId: 'med-1' }), auth)
  check(scan, { 'sample label 200': (r) => r.status === 200 })
  check(http.post(`${API}/history`, JSON.stringify({ scan: scan.json('data') }), auth), {
    'save to history 2xx': (r) => r.status < 300,
  })
  check(http.get(`${API}/history/all`, auth), { 'history list 200': (r) => r.status === 200 })

  sleep(1 + Math.random() * 2) // reading the screen
}
