import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultGraph,
  orderedGenerateNodes,
  parseGraph,
  serializeGraph,
  upstreamInputs,
  type CanvasEdge,
  type CanvasNode,
} from './workflow'

test('parseGraph rejects shapes that are not the stored workflow contract', () => {
  assert.equal(parseGraph(null), null)
  assert.equal(parseGraph({}), null)
  assert.equal(parseGraph({ nodes: 'nope', edges: [] }), null)
  assert.equal(
    parseGraph({ nodes: [{ id: 'a', type: 'prompt', position: { x: 0, y: 0 } }], edges: [] })?.nodes.length,
    1,
  )
})

test('serializeGraph keeps only durable node and edge fields', () => {
  const node: CanvasNode = {
    id: 'n1',
    type: 'prompt',
    position: { x: 10, y: 20 },
    selected: true,
    data: { text: 'hello' },
  }
  const edge: CanvasEdge = {
    id: 'e1',
    source: 'n1',
    target: 'n2',
    selected: true,
    style: { stroke: 'red' },
  }
  const graph = serializeGraph([node], [edge])
  assert.deepEqual(graph.nodes[0], {
    id: 'n1',
    type: 'prompt',
    position: { x: 10, y: 20 },
    data: { text: 'hello' },
  })
  assert.deepEqual(graph.edges[0], {
    id: 'e1',
    source: 'n1',
    target: 'n2',
    sourceHandle: null,
    targetHandle: null,
    type: 'smoothstep',
  })
})

test('orderedGenerateNodes respects dependencies between generate nodes', () => {
  const nodes: CanvasNode[] = [
    { id: 'a', type: 'generate-image', position: { x: 0, y: 0 }, data: {} },
    { id: 'b', type: 'generate-image', position: { x: 0, y: 0 }, data: {} },
    { id: 'text', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'prompt' } },
  ]
  const edges: CanvasEdge[] = [
    { id: 'e1', source: 'text', target: 'a' },
    { id: 'e2', source: 'a', target: 'b' },
  ]
  const order = orderedGenerateNodes(nodes, edges).map((node) => node.id)
  assert.deepEqual(order, ['a', 'b'])
})

test('upstreamInputs joins text and dedupes reference assets', () => {
  const nodes: CanvasNode[] = [
    { id: 'p', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'first' } },
    { id: 'p2', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'second' } },
    { id: 'img', type: 'image-input', position: { x: 0, y: 0 }, data: { assetIds: ['a', 'b'] } },
    { id: 'gen', type: 'generate-image', position: { x: 0, y: 0 }, data: {} },
  ]
  const edges: CanvasEdge[] = [
    { id: 'e1', source: 'p', target: 'gen' },
    { id: 'e2', source: 'p2', target: 'gen' },
    { id: 'e3', source: 'img', target: 'gen' },
    { id: 'e4', source: 'img', target: 'gen' },
  ]
  assert.deepEqual(upstreamInputs('gen', nodes, edges), {
    prompt: 'first\n\nsecond',
    assetIds: ['a', 'b'],
  })
})

test('defaultGraph wires a prompt into a generate node', () => {
  const graph = defaultGraph()
  assert.equal(graph.nodes.length, 2)
  assert.equal(graph.edges.length, 1)
  assert.equal(graph.edges[0]?.source, 'prompt-start')
  assert.equal(graph.edges[0]?.target, 'generate-start')
})
