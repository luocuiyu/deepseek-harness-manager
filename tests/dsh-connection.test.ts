import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DshConnection, lineCollector, localLaunchUrl, managedArgs, redactLaunchTokens } from '../src/main/dsh-connection.ts'

const scope = { port: 3080, dshHome: 'test-home' }
test('managed web launches suppress browsers and use the configured port', () => {
  assert.deepEqual(managedArgs(['@deepseek-ai/dsh'], 'web', 39001), ['@deepseek-ai/dsh', 'web', '--no-open', '--port', '39001'])
  assert.deepEqual(managedArgs(['cli.js', '--open', '--port=9999', '--no-open'], 'web', 3080), ['cli.js', 'web', '--no-open', '--port', '3080'])
  assert.deepEqual(managedArgs(['cli.js', '--port', '9999'], 'web', 3080), ['cli.js', 'web', '--no-open', '--port', '3080'])
  assert.deepEqual(managedArgs(['cli.js'], 'headless', 3080), ['cli.js', 'headless'])
})
test('launch URL validation keeps authentication on the configured loopback listener', () => {
  assert.equal(localLaunchUrl('http://localhost:3080/?token=test-only&redirect=https://example.com', scope), 'http://127.0.0.1:3080/?token=test-only')
  for (const url of ['https://example.com/?token=a', 'http://127.0.0.1:30800/?token=a', 'http://127.0.0.1:3080/other?token=a', 'http://user@127.0.0.1:3080/?token=a', 'http://127.0.0.1:3080/?token=a&token=b', 'http://127.0.0.1:3080/?token=', 'http://127.0.0.1:3080/?token=a#fragment', 'http://127.0.0.1:3080/', 'http://example.com:3080/?token=a']) {
    assert.equal(localLaunchUrl(url, scope), null, url)
  }
})
test('arbitrary UTF-8 and URL chunk boundaries preserve authentication but redact logs', () => {
  const connection = new DshConnection()
  connection.reset(scope)
  const lines: string[] = []
  const collector = lineCollector(line => { connection.observe(line, scope); lines.push(redactLaunchTokens(line)) })
  const bytes = Buffer.from('就绪\r\ndsh web: http://127.0.0.1:3080/?token=test-only-secret\r\n末行')
  for (const byte of bytes) collector.write(Buffer.from([byte]))
  collector.end()
  assert.deepEqual(lines, ['就绪', 'dsh web: http://127.0.0.1:3080/?token=[REDACTED]', '末行'])
  assert.equal(connection.isAnnounced(scope), true)
  assert.equal(connection.getUrl(scope), 'http://127.0.0.1:3080/?token=test-only-secret')
  assert.equal(connection.getUrl({ ...scope, dshHome: 'other-home' }), 'http://127.0.0.1:3080/')
  connection.reset(scope)
  assert.equal(connection.isAnnounced(scope), false)
  assert.equal(connection.getUrl(scope), 'http://127.0.0.1:3080/')
})
test('external instance links stay scoped and cannot be replaced by untrusted logs', () => {
  const connection = new DshConnection()
  assert.equal(connection.enter('http://127.0.0.1:3080/?token=manual-test-only', scope), true)
  connection.observe('dsh web: http://example.com:3080/?token=foreign', scope)
  assert.equal(connection.getUrl(scope), 'http://127.0.0.1:3080/?token=manual-test-only')
  assert.equal(connection.getUrl({ ...scope, port: 39000 }), 'http://127.0.0.1:39000/')
  assert.equal(redactLaunchTokens('http://example.com/?token=secret'), 'http://example.com/?token=[REDACTED]')
})
