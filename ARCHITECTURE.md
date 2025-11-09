# Architecture Overview

## 🔹 High-Level Flow

1. When a user opens the page, `index.html` loads the frontend scripts (`main.js`, `canvas.js`, and `websocket.js`).
2. The client establishes a real-time connection to the Node.js server via **Socket.io** (`server.js`).
3. As a user starts drawing, the client sends three types of events to the server:  
   `stroke:start`, multiple `stroke:chunk` events (batched points), and a final `stroke:end`.
4. The server keeps temporary stroke data until it receives `stroke:end`, then commits the full stroke to the shared `DrawingState`.
5. The server broadcasts stroke updates to all connected clients, allowing everyone to see drawings appear in real-time.
6. Undo and redo actions (`undo`, `redo`) manipulate a shared operation history on the server, which emits `apply_op` events to keep all canvases in sync.

## 🔹 Message Protocol (Socket.io Events)

| **Event**       | **Direction**                    | **Payload**                          | **Purpose** |
|-----------------|----------------------------------|--------------------------------------|-------------|
| `cursor`        | client → server → others         | `{x, y}`                             | Broadcasts current pointer position to other users |
| `stroke:start`  | client → server → all            | `{id, color, width, tool}`           | Signals the start of a new stroke |
| `stroke:chunk`  | client → server → all            | `{id, points: [{x, y}, ...]}`        | Sends batches of stroke points while drawing |
| `stroke:end`    | client → server → all            | `{id}`                               | Marks the stroke as complete (server commits to history) |
| `undo`          | client → server → all            | —                                    | Requests an undo of the most recent operation |
| `redo`          | client → server → all            | —                                    | Reapplies the next operation in history |
| `apply_op`      | server → all                     | `{type: 'add'|'remove', stroke}`     | Tells all clients to add or remove a stroke (from undo/redo) |
| `request:state` | client → server                  | —                                    | Client requests the full canvas state after reconnecting |
| `state`         | server → client                  | `{strokes: [...]}`                   | Server sends the full current canvas snapshot |

---

```
{
  id: string,        // client generated id
  points: [{x:number, y:number}, ...],
  color: string,
  width: number,
  tool: 'brush' | 'eraser'
}
```

Operation history entry:

```
{
  type: 'add' | 'remove',
  stroke: Stroke
}
```

History pointer indexes which ops are active (0..pointer-1). Undo decrements; redo increments.

## 🔹 Undo / Redo Mechanics

- On stroke commit, push an 'add' op.
- Undo: find the last active op; create its inverse without storing it; apply inverse to live stroke set; broadcast `apply_op`.
- Redo: reapply the next op in history; broadcast `apply_op`.
- Removing a stroke stores the stroke in the remove op so redo can restore it.
- History capped (MAX_HISTORY = 2000) to prevent memory leaks by trimming oldest ops and strokes.

## 🔹 Eraser Implementation

- Eraser is treated as a separate stroke with `tool:'eraser'`.
- Client renders eraser strokes using canvas globalCompositeOperation = 'destination-out' for that path only, then restores 'source-over'.
- Because eraser strokes are independent, undoing an eraser just removes that eraser stroke (revealing what it had erased). No pixel diff storage required.

## 🔹 Performance Choices

- Point batching: client accumulates raw pointer moves and sends them in arrays to reduce event spam.
- Point thinning: ignore moves closer than a small threshold to reduce overdraw.
- Conditional redraw: small incremental add strokes are drawn directly; larger ops trigger full canvas re-render from strokes list to ensure consistency.
- History cap: avoids unbounded memory growth.
- Transient stroke buffer on server prevents partial commit until stroke:end.

## 🔹 Concurrency & Consistency

- Single shared room; operations are applied in arrival order.
- Undo/redo are global (any user affects shared state). Potential conflicts (two users undo simultaneously) resolve by sequential server processing.
- No optimistic local prediction beyond rendering points received; authoritative state lives on server.

## 🔹 Failure / Reconnect Handling

- Client listens for disconnect/reconnect; on reconnect emits `request:state` to rebuild canvas.
- Transient strokes from a disconnected user are discarded server-side.

## 🔹 Security & Auth

- None. Socket ids implicitly identify participants; no permissions model.

## 🔹 Extensibility Notes

Future improvements could include:

- Multiple rooms (RoomManager keyed by room id)
- Persistent storage (e.g., Redis or database for strokes)
- Per-user undo (maintain user-scoped stacks)
- Layering system (separate stroke groups for performance)
- Selective eraser (proximity-based deletion of stroke segments)
- Compression (simplify stroke paths server-side)

## 🔹 Limitations

- No persistence; refresh clears canvas.
- Global undo can surprise users when multiple are drawing.
- Eraser compositing means true pixel history isn't stored.
- One large history array kept in memory (bounded but still potentially heavy at max size).

## 🔹 Rationale Summary

Keep primitives simple (strokes as arrays of points) for clarity and easy broadcasting. Use compositing for eraser to avoid complex geometric diffing. Linear history pointer keeps undo logic straightforward under concurrent usage.
