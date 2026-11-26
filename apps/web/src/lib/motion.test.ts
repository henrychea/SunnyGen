import assert from 'node:assert/strict'
import { test } from 'node:test'
import { motionFade, motionFadeRise, motionFast, motionPop, motionTransition } from '@sunnygen/ui'

const PRESETS = { fade: motionFade, fadeRise: motionFadeRise, pop: motionPop }

test('shared motion presets stay subtle and fast', () => {
  for (const [name, preset] of Object.entries(PRESETS)) {
    assert.deepEqual(Object.keys(preset).sort(), ['hidden', 'visible'], `${name} needs both states`)
    for (const variant of Object.values(preset) as Array<{
      transition?: { duration?: number; ease?: string }
    }>) {
      const duration = variant.transition?.duration ?? 0
      assert.ok(duration >= 0.12 && duration <= 0.3, `${name} duration ${duration} is outside 0.12-0.3s`)
      assert.equal(variant.transition?.ease, 'easeOut', `${name} must ease out`)
    }
  }
  assert.equal((motionFast as { duration: number }).duration, 0.16)
  assert.equal((motionTransition as { duration: number }).duration, 0.2)
})
