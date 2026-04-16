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
    const filtered = this.ids.filter((id) => (this.vertices.get(id) ?? {})[prop] === value)
    return new VertexTraversal(this.vertices, this.edges, filtered)
  }

  outE(label) {
    const edgeIds = []
    for (const [edgeId, edge] of this.edges) {
      if (!this.ids.includes(edge.fromId)) continue
      if (label != null && edge.label !== label) continue
      edgeIds.push(edgeId)
    }
    return new EdgeTraversal(this.vertices, this.edges, edgeIds)
  }

  out(label) {
    const vertexIds = []
    for (const edge of this.edges.values()) {
      if (!this.ids.includes(edge.fromId)) continue
      if (label != null && edge.label !== label) continue
      if (edge.toId && this.vertices.has(edge.toId)) vertexIds.push(edge.toId)
    }
    return new VertexTraversal(this.vertices, this.edges, vertexIds)
  }

  async valueMap(...props) {
    return this.ids.map((id) => {
      const src = this.vertices.get(id) || {}
      if (!props.length) return { ...src }
      const mapped = {}
      for (const key of props) mapped[key] = src[key]
      return mapped
    })
  }

  async id() {
    return [...this.ids]
  }
}

class EdgeTraversal {
  constructor(vertices, edges, ids) {
    this.vertices = vertices
    this.edges = edges
    this.ids = ids
  }

  inV() {
    const vertexIds = this.ids
      .map((id) => this.edges.get(id)?.toId)
      .filter((id) => id && this.vertices.has(id))
    return new VertexTraversal(this.vertices, this.edges, vertexIds)
  }

  async valueMap(...props) {
    return this.ids.map((id) => {
      const src = this.edges.get(id) || {}
      if (!props.length) return { ...src }
      const mapped = {}
      for (const key of props) mapped[key] = src[key]
      return mapped
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

  addEdge(id, fromId, toId, props = {}) {
    this.edges.set(id, { fromId, toId, ...props })
  }

  V(id) {
    const ids = normalizeIds(id, this.vertices)
    return new VertexTraversal(this.vertices, this.edges, ids)
  }

  E(id) {
    const ids = normalizeIds(id, this.edges)
    return new EdgeTraversal(this.vertices, this.edges, ids)
  }
}

function normalizeIds(id, store) {
  if (id == null) return [...store.keys()]
  if (Array.isArray(id)) return id.filter((entry) => store.has(entry))
  if (store.has(id)) return [id]
  return []
}

function createGraphWithImports({ shared, importer }) {
  const graph = new FakeGraph()
  const componentLabel = domain.vertex.component.constants.LABEL
  const importRefLabel = domain.vertex.importRef.constants.LABEL
  const hasImportLabel = domain.edge.has_import.component_importRef.constants.LABEL
  const importOfLabel = domain.edge.import_of.importRef_component.constants.LABEL

  const sharedId = 'component-shared'
  const importerId = 'component-importer'

  graph.addVertex(sharedId, { label: componentLabel, hash: shared.hash, name: shared.name })
  graph.addVertex(importerId, { label: componentLabel, hash: importer.hash, name: importer.name })

  importer.imports.forEach(({ name }, index) => {
    const importRefId = `import-ref-${index + 1}`
    graph.addVertex(importRefId, { label: importRefLabel, alias: name })
    graph.addEdge(
      `edge-${index + 1}`,
      importerId,
      importRefId,
      { label: hasImportLabel },
    )
    graph.addEdge(
      `edge-import-${index + 1}`,
      importRefId,
      sharedId,
      { label: importOfLabel },
    )
  })

  return { g: graph }
}

test('componentSpec returns imports with distinct aliases for duplicate hash', async () => {
  const shared = { hash: 'import-shared-hash', name: 'SharedImport', tasks: [], data: [] }
  const importer = {
    hash: 'importing-parent-hash',
    name: 'ImportingComponent',
    tasks: [],
    data: [],
    imports: [
      { name: 'alpha', hash: shared.hash },
      { name: 'beta', hash: shared.hash },
    ],
  }

  const { g } = createGraphWithImports({ shared, importer })

  const result = await runGql({
    schema,
    source: `query ComponentSpecImports($hash: String!) {
      componentSpec(hash: $hash) {
        imports {
          totalCount
          edges {
            cursor
            node {
              alias
              hash
              name
            }
          }
        }
      }
    }`,
    variableValues: { hash: importer.hash },
    contextValue: { g },
  })

  assert.ok(!result.errors?.length, `Unexpected errors: ${result.errors?.map((err) => err.message).join(', ')}`)

  const imports = result.data?.componentSpec?.imports
  assert.ok(imports, 'imports missing from response')
  assert.equal(imports.totalCount, importer.imports.length)
  assert.equal(imports.edges.length, importer.imports.length)

  const aliases = imports.edges.map(({ node }) => node.alias).sort()
  assert.deepEqual(aliases, importer.imports.map(({ name }) => name).sort())
  assert.ok(imports.edges.every(({ node }) => node.hash === shared.hash))
})
