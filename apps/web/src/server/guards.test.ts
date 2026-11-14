import assert from 'node:assert/strict'
import { test } from 'node:test'
import { originGuard } from './guards.server'

function post(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers })
}

function status(response: Response | null): number {
  return response ? response.status : 200
}

test('allows a same-origin POST', () => {
  const response = originGuard(
    post('http://localhost:8977/_serverFn/abc', {
      origin: 'http://localhost:8977',
      'sec-fetch-site': 'same-origin',
    }),
  )
  assert.equal(status(response), 200)
})

test('allows a tunnel POST when TLS is terminated upstream', () => {
  const response = originGuard(
    post('http://sunnygen.henrychea.com/_serverFn/abc', {
      origin: 'https://sunnygen.henrychea.com',
      host: 'sunnygen.henrychea.com',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    }),
  )
  assert.equal(status(response), 200)
})

test('uses the forwarded host when the proxy rewrites Host', () => {
  const response = originGuard(
    post('http://127.0.0.1:8977/_serverFn/abc', {
      origin: 'https://sunnygen.henrychea.com',
      host: '127.0.0.1:8977',
      'x-forwarded-host': 'sunnygen.henrychea.com',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    }),
  )
  assert.equal(status(response), 200)
})

test('rejects a cross-site origin', () => {
  const response = originGuard(
    post('https://sunnygen.henrychea.com/_serverFn/abc', {
      origin: 'https://attacker.example',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-origin',
    }),
  )
  assert.equal(status(response), 403)
})

test('rejects same-site requests', () => {
  const response = originGuard(
    post('https://sunnygen.henrychea.com/_serverFn/abc', {
      origin: 'https://other.henrychea.com',
      'x-forwarded-proto': 'https',
      'sec-fetch-site': 'same-site',
    }),
  )
  assert.equal(status(response), 403)
})

test('rejects an invalid forwarded protocol', () => {
  const response = originGuard(
    post('http://sunnygen.henrychea.com/_serverFn/abc', {
      origin: 'https://sunnygen.henrychea.com',
      'x-forwarded-proto': 'file',
      'sec-fetch-site': 'same-origin',
    }),
  )
  assert.equal(status(response), 403)
})

test('ignores GET requests', () => {
  const response = originGuard(
    new Request('https://sunnygen.henrychea.com/settings', {
      headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    }),
  )
  assert.equal(status(response), 200)
})

test('allows non-browser callers without Origin', () => {
  assert.equal(status(originGuard(post('http://127.0.0.1:8977/_serverFn/abc'))), 200)
})
