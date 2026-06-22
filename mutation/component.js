import { GraphQLBoolean, GraphQLNonNull, GraphQLObjectType, GraphQLString } from 'graphql'
import { ulid } from 'ulid'
import { create as createBasicSubject } from '@liquid-bricks/lib-nats-subject/create/basic'

import { events as natsEvents } from '@liquid-bricks/lib-nats-subject/events/nats'


const componentSpecCreateInstancePayloadType = new GraphQLObjectType({
  name: 'ComponentSpecCreateInstancePayload',
  fields: () => ({
    instanceId: { type: new GraphQLNonNull(GraphQLString) },
  }),
});

export const componentSpecCreateInstanceField = {
  type: new GraphQLNonNull(componentSpecCreateInstancePayloadType),
  args: {
    componentHash: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (_parent, { componentHash }, { natsContext }) => {
    const instanceId = ulid();
    const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.create.v1['*']).forPublish()
      .env('prod')

    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { componentHash, instanceId } })
    )
    return { instanceId };
  },
}

const componentInstanceStartPayloadType = new GraphQLObjectType({
  name: 'ComponentInstanceStartPayload',
  fields: () => ({
    ok: { type: new GraphQLNonNull(GraphQLBoolean) },
  }),
});

export const componentInstanceStartField = {
  type: new GraphQLNonNull(componentInstanceStartPayloadType),
  args: {
    instanceId: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (_parent, { instanceId }, { natsContext }) => {
    const subject = createBasicSubject(natsEvents['*'].component_service['*']['*'].cmd.componentInstance.start.v1['*']).forPublish()
      .env('prod')

    await natsContext.publish(
      subject.build(),
      JSON.stringify({ data: { instanceId } })
    )
    return { ok: true };
  },
};

export const componentInstanceProvideDataField = {
  type: new GraphQLNonNull(componentInstanceStartPayloadType),
  args: {
    instanceId: { type: new GraphQLNonNull(GraphQLString) },
    stateId: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(GraphQLString) },
    payload: { type: new GraphQLNonNull(GraphQLString) },
  },
  resolve: async (_parent, { instanceId, stateId, name, type, payload }, { natsContext }) => {
    let parsed;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      throw new Error(`Invalid JSON payload: ${err.message}`);
    }

    const safeName = String(name || '').trim();

    if (!safeName) {
      throw new Error('Name is required for provide data');
    }

    switch (type) {
      case 'data': {
        const subject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.data).forPublish()
          .env('prod')

        await natsContext.publish(
          subject.build(),
          JSON.stringify({ data: { instanceId, stateId, name: safeName, type, result: parsed } })
        )
        return { ok: true };
      }
      case 'gate': {
        const subject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.gate).forPublish()
          .env('prod')

        await natsContext.publish(
          subject.build(),
          JSON.stringify({ data: { instanceId, stateId, name: safeName, type, result: parsed } })
        )
        return { ok: true };
      }
      case 'task': {
        const subject = createBasicSubject(natsEvents['*'].component_service['*'].function_result.evt.component.compute_function.v1.task).forPublish()
          .env('prod')

        await natsContext.publish(
          subject.build(),
          JSON.stringify({ data: { instanceId, stateId, name: safeName, type, result: parsed } })
        )
        return { ok: true };
      }
      default:
        throw new Error('Unsupported provide data type: ' + type);
    }
  },
};
