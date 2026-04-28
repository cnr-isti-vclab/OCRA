# Frontend Guide: AnnotationApiClient and AnnotationEventsService

This page shows the simplest way to use the frontend annotation helpers.

These classes are for the new annotation model.
They do not use the old `scene.annotations` field.

## What the model looks like

One logical annotation is made of three parts:

- `geometry`: the shape in the scene
- `datum`: the text and metadata
- `link`: the connection between geometry and datum

Because of this, creating one annotation usually means creating all three parts.

## Import

```ts
import { AnnotationApiClient } from '../src/services/AnnotationApiClient';
import { AnnotationEventsService } from '../src/services/AnnotationEventsService';
```

## Create the client

```ts
const client = new AnnotationApiClient({
  projectId: 'project-id',
  sceneId: 'scene-id',
});
```

## Read the annotation list

### Read only non-erasable items

Pass `false` to exclude erasable items.

```ts
const bundle = await client.loadSceneBundle(false);

console.log(bundle.geometries);
console.log(bundle.data);
console.log(bundle.links);
```

You can also read only one kind of entity:

```ts
const dataOnly = await client.loadSceneData(false);
const geometriesOnly = await client.loadSceneGeometries(false);
const linksOnly = await client.loadSceneLinks(false);
```

### Read also erasable items

Pass `true` to include erasable items.

```ts
const bundleWithErasable = await client.loadSceneBundle(true);
```

This is the same as the default:

```ts
const sameResult = await client.loadSceneBundle();
```

## Create one annotation

The simplest way is to use `createSceneAnnotation()`.
It creates:

- one geometry
- one datum
- one link

```ts
const created = await client.createSceneAnnotation({
  shapes: [
    {
      type: 'ShapePoints',
      vertices: [[1, 2, 3]],
    },
  ],
  label: 'My annotation',
  description: 'Created from the frontend client',
  class: 'demo.note',
  content: {
    source: 'frontend-example',
  },
});

console.log(created.geometry.id);
console.log(created.datum.id);
console.log(created.link.id);
```

If you want full control, you can do the three steps manually:

```ts
const geometry = await client.createGeometry({
  shapes: [
    {
      type: 'ShapePoints',
      vertices: [[1, 2, 3]],
    },
  ],
  referenceType: 'scene',
  referenceId: 'scene-id',
});

const datum = await client.createData({
  label: 'My annotation',
  description: 'Created manually',
  class: 'demo.note',
  content: { source: 'manual-example' },
  visibilityType: 'scene',
  visibilityId: 'scene-id',
});

const link = await client.createLink({
  geometryId: geometry.id,
  dataId: datum.id,
});
```

## Read one single annotation entity

The model is split, so you normally read a single geometry, datum, or link.

### Read one datum

```ts
const datum = await client.getData('data-id');
console.log(datum.label);
console.log(datum.version);
```

### Read one geometry

```ts
const geometry = await client.getGeometry('geometry-id');
console.log(geometry.shapes);
console.log(geometry.version);
```

### Read one link

```ts
const link = await client.getLink('link-id');
console.log(link.geometryId, link.dataId);
```

If you only want non-erasable items, pass `false` as the second argument:

```ts
const datum = await client.getData('data-id', false);
```

## Modify one annotation

The most common update is to modify the datum.

You must send the current `version` as `expectedVersion`.
This is the OCC check.

```ts
const datum = await client.getData('data-id');

await client.updateData(datum.id, {
  expectedVersion: datum.version,
  label: 'Updated label',
  description: 'Updated from the frontend',
  content: {
    ...datum.content,
    updatedBy: 'frontend-example',
  },
});
```

You can update geometry in the same way:

```ts
const geometry = await client.getGeometry('geometry-id');

await client.updateGeometry(geometry.id, {
  expectedVersion: geometry.version,
  shapes: [
    {
      type: 'ShapePoints',
      vertices: [[4, 5, 6]],
    },
  ],
});
```

## Connect to the social channel

You can connect in two ways.

### Simple way: use `AnnotationApiClient`

```ts
client.connectRealtime({
  onConnected: (event) => {
    console.log('Connected');
    console.log('Stream id:', event.streamId);
    console.log('Active locks:', event.activeSocialLocks);
  },
  onConnectionStateChange: (state) => {
    console.log('State:', state);
  },
  onMutation: (event) => {
    console.log('Mutation:', event.mutation, event.entity);
  },
  onSocialLockStarted: (event) => {
    console.log('Lock started:', event);
  },
  onSocialLockStopped: (event) => {
    console.log('Lock stopped:', event);
  },
});
```

When you are done:

```ts
client.disconnectRealtime();
```

### Low-level way: use `AnnotationEventsService`

```ts
const events = new AnnotationEventsService('project-id', 'scene-id');

events.connect({
  onConnected: (event) => {
    console.log('Connected with stream:', event.streamId);
  },
  onMutation: (event) => {
    console.log('Mutation:', event);
  },
  onSocialLockStarted: (event) => {
    console.log('Lock started:', event);
  },
  onSocialLockStopped: (event) => {
    console.log('Lock stopped:', event);
  },
});

events.disconnect();
```

## Take the social lock

The social lock is an informational signal.
It tells other users what this session is editing.
It does not block writes by itself.

### Scene-wide lock

```ts
await client.notifySocialLockStart({
  activity: 'editing annotations',
});
```

### Lock one specific resource

```ts
await client.notifySocialLockStart({
  resourceType: 'data',
  resourceId: 'data-id',
  activity: 'editing annotation text',
});
```

### Release the social lock

```ts
await client.notifySocialLockStop({
  resourceType: 'data',
  resourceId: 'data-id',
  activity: 'editing annotation text',
});
```

## Receive social information

The social channel sends three kinds of information:

- connection information
- mutation events
- social lock start/stop events

Example:

```ts
client.connectRealtime({
  onConnected: (event) => {
    console.log('Already active locks:', event.activeSocialLocks);
  },
  onMutation: (event) => {
    console.log(`${event.username} changed ${event.entity.kind} ${event.entity.id}`);
  },
  onSocialLockStarted: (event) => {
    console.log(`${event.username} started editing`);
  },
  onSocialLockStopped: (event) => {
    console.log(`${event.username} stopped editing`);
  },
});
```

## Small React example

```ts
useEffect(() => {
  const client = new AnnotationApiClient({
    projectId,
    sceneId,
  });

  client.connectRealtime({
    onMutation: (event) => {
      console.log('Remote change:', event);
    },
  });

  return () => {
    client.disconnectRealtime();
  };
}, [projectId, sceneId]);
```

## Summary

- Use `AnnotationApiClient` for normal frontend work.
- Use `loadSceneBundle(false)` for only non-erasable items.
- Use `loadSceneBundle(true)` for non-erasable and erasable items.
- Use `createSceneAnnotation()` for the simplest full create flow.
- Use `getData()`, `getGeometry()`, and `getLink()` for single-entity reads.
- Use `updateData()` or `updateGeometry()` with `expectedVersion` for OCC-safe updates.
- Use `connectRealtime()` and `notifySocialLockStart()` for social awareness.