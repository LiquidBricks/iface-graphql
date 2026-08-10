import test from 'node:test'
import assert from 'node:assert/strict'
import { domain } from '@liquid-bricks/spec-domain/domain'

import { schema } from '../../../index.js'
import { runGql } from '../../util/runGql.js'

class VertexTraversal {
  constructor(vertices, edges, ids) {
    this.vertices = vertices
    this.edges = edges
    this.ids = ids
  }

  has(prop, value) {
    return new VertexTraversal(
      this.vertices,
      this.edges,
      this.ids.filter((id) => (this.vertices.get(id) ?? {})[prop] === value),
    )
  }

  in(label) {
    const vertexIds = []
    for (const edge of this.edges.values()) {
      if (!this.ids.includes(edge.toId)) continue
      if (label != null && edge.label !== label) continue
      if (edge.fromId && this.vertices.has(edge.fromId)) vertexIds.push(edge.fromId)
    }
    return new VertexTraversal(this.vertices, this.edges, vertexIds)
  }

  async valueMap(...props) {
    return this.ids.map((id) => {
      const source = this.vertices.get(id) ?? {}
      if (!props.length) return { ...source }
      return Object.fromEntries(props.map((prop) => [prop, source[prop]]))
    })
  }

  async id() {
    return [...this.ids]
  }
}

class FakeGraph {
  constructor() {
    this.vertices = new Map()
    this.edges = new Map()
  }

  addVertex(id, props) {
    this.vertices.set(id, { ...props })
  }

  addEdge(id, fromId, toId, label) {
    this.edges.set(id, { fromId, toId, label })
  }

  V(id) {
    const ids = id == null
      ? [...this.vertices.keys()]
      : (Array.isArray(id) ? id : [id]).filter((value) => this.vertices.has(value))
    return new VertexTraversal(this.vertices, this.edges, ids)
  }
}

function createInstanceGraph() {
  const g = new FakeGraph()
  const instanceLabel = domain.vertex.componentInstance.constants.LABEL

  g.addVertex('root', { label: instanceLabel, instanceId: 'root-instance' })
  g.addVertex('import-child', { label: instanceLabel, instanceId: 'import-child-instance' })
  g.addVertex('gate-child', { label: instanceLabel, instanceId: 'gate-child-instance' })
  g.addVertex('import-ref', { label: domain.vertex.importInstanceRef.constants.LABEL })
  g.addVertex('gate-ref', { label: domain.vertex.gateInstanceRef.constants.LABEL })

  g.addEdge(
    'root-import-ref',
    'root',
    'import-ref',
    domain.edge.uses_import.componentInstance_importInstanceRef.constants.LABEL,
  )
  g.addEdge(
    'import-ref-child',
    'import-ref',
    'import-child',
    domain.edge.uses_import.importInstanceRef_componentInstance.constants.LABEL,
  )
  g.addEdge(
    'root-gate-ref',
    'root',
    'gate-ref',
    domain.edge.uses_gate.componentInstance_gateInstanceRef.constants.LABEL,
  )
  g.addEdge(
    'gate-ref-child',
    'gate-ref',
    'gate-child',
    domain.edge.uses_gate.gateInstanceRef_componentInstance.constants.LABEL,
  )

  return g
}

async function queryParent(g, instanceId) {
  return runGql({
    schema,
    source: `query ComponentSpecInstanceParent($instanceId: String!) {
      componentSpecInstance(instanceId: $instanceId) {
        instanceId
        parent {
          instanceId
        }
      }
    }`,
    variableValues: { instanceId },
    contextValue: { g },
  })
}

test('componentSpecInstance returns the owning import or gate parent', async () => {
  const g = createInstanceGraph()

  const imported = await queryParent(g, 'import-child-instance')
  assert.ok(!imported.errors?.length, `Unexpected errors: ${imported.errors?.map((error) => error.message).join(', ')}`)
  assert.equal(imported.data?.componentSpecInstance?.parent?.instanceId, 'root-instance')

  const gated = await queryParent(g, 'gate-child-instance')
  assert.ok(!gated.errors?.length, `Unexpected errors: ${gated.errors?.map((error) => error.message).join(', ')}`)
  assert.equal(gated.data?.componentSpecInstance?.parent?.instanceId, 'root-instance')

  const root = await queryParent(g, 'root-instance')
  assert.ok(!root.errors?.length, `Unexpected errors: ${root.errors?.map((error) => error.message).join(', ')}`)
  assert.equal(root.data?.componentSpecInstance?.parent, null)
})
