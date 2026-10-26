import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateOfficialPreset, DEEPSEEK_MESSAGES_BASE, clampAppearance } from '../src/shared/appearance.ts'

const official = { id: 'deepseek-official', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', balanceUrl: 'https://api.deepseek.com/user/balance', apiKey: 'test-only-key' }

test('legacy official Messages endpoint migrates while key and balance stay intact', () => {
  assert.deepEqual(migrateOfficialPreset(official), { ...official, baseUrl: DEEPSEEK_MESSAGES_BASE })
  assert.equal(migrateOfficialPreset({ ...official, baseUrl: official.baseUrl + '/' }).baseUrl, DEEPSEEK_MESSAGES_BASE)
  const updated = { ...official, baseUrl: DEEPSEEK_MESSAGES_BASE }
  assert.equal(migrateOfficialPreset(updated), updated)
})
test('custom providers and deliberately changed official presets are preserved', () => {
  for (const preset of [
    { ...official, id: 'custom' },
    { ...official, baseUrl: 'https://gateway.example/anthropic' },
    { ...official, baseUrl: 'https://api.deepseek.com.example' }
  ]) assert.equal(migrateOfficialPreset(preset), preset)
})
test('appearance rejects nonfinite values and keeps readable bounds', () => {
  assert.equal(clampAppearance(NaN, 36, 15, 75), 36)
  assert.equal(clampAppearance(Infinity, 36, 15, 75), 36)
  assert.equal(clampAppearance('100', 36, 15, 75), 36)
  assert.equal(clampAppearance(-20, 36, 15, 75), 15)
  assert.equal(clampAppearance(120, 36, 15, 75), 75)
})
