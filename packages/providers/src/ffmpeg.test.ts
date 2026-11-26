import assert from 'node:assert/strict'
import { test } from 'node:test'
import { concatArgs, videoFrameArgs } from './ffmpeg'

test('frame extraction passes each path as its own argument', () => {
  const args = videoFrameArgs({ path: '/tmp/a b;rm -rf.mp4', times: [0, 1.5], outDir: '/tmp/f' })
  assert.equal(args.length, 2)
  assert.equal(args[0]?.[0], '-ss')
  assert.ok(args[0]?.includes('/tmp/a b;rm -rf.mp4'))
  assert.equal(args[0]?.filter((part) => part === '-i').length, 1)
})

test('concat defaults to a copy and falls back to h264', () => {
  assert.ok(concatArgs({ listPath: '/tmp/l.txt', outPath: '/tmp/o.mp4', copy: true }).includes('copy'))
  assert.ok(
    concatArgs({ listPath: '/tmp/l.txt', outPath: '/tmp/o.mp4', copy: false }).join(' ').includes('libx264'),
  )
})
