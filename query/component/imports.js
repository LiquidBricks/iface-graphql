import { GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'
import { createConnectionType, toConnection } from '../../common/relay.js'
import { domain } from '@liquid-bricks/spec-domain/domain'
import { fetchVertexProp } from './nodeHelpers.js'

function unwrap(value) {
  if (Array.isArray(value)) {
    return value.length ? value[0] ?? null : null
  }
  return value ?? null
}


export const componentSpecImportNodeType = new GraphQLObjectType({
  name: 'ComponentSpecImportNode',
  fields: () => ({
    createdAt: {
      type: GraphQLString,
      resolve: async (source, _args, { g }) => fetchVertexProp(source, 'createdAt', g),
    },
    updatedAt: {
      type: GraphQLString,
      resolve: async (source, _args, { g }) => fetchVertexProp(source, 'updatedAt', g),
    },
    alias: {
      type: GraphQLString,
      resolve: (source) => unwrap(source?.alias),
    },
    name: {
      type: GraphQLString,
      resolve: async (source, _args, { g }) => fetchVertexProp(source, 'name', g),
    },
    hash: {
      type: GraphQLString,
      resolve: async (source, _args, { g }) => fetchVertexProp(source, 'hash', g),
    },
  }),
});



const { connectionType: ComponentSpecImportsConnection } = createConnectionType('ComponentSpecImports', componentSpecImportNodeType)

export const field = {
  type: new GraphQLNonNull(ComponentSpecImportsConnection),
  resolve: async (id, _args, { g }) => {
    const importRefIds = await g.V(id).out(domain.edge.has_import.component_importRef.constants.LABEL).id()
    const imports = await Promise.all(
      importRefIds.map(async (importRefId) => {
        const propsSnapshot = await g.V(importRefId).valueMap('alias')
        const props = Array.isArray(propsSnapshot) ? propsSnapshot[0] : null
        const [componentId] = await g
          .V(importRefId)
          .out(domain.edge.import_of.importRef_component.constants.LABEL)
          .id()
        if (!componentId) return null
        return {
          id: componentId,
          alias: unwrap(props?.alias),
        }
      }),
    )
    return toConnection(imports.filter(Boolean))
  },
}
