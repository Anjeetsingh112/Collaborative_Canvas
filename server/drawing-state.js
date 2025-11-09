// Keeps strokes plus a simple linear history for undo/redo.
// Op shapes:
//   { type:'add', stroke }
//   { type:'remove', strokeId, removedStroke }
// historyPointer = count of applied ops.

const MAX_HISTORY = 2000; // cap to avoid unbounded memory growth

class DrawingState {
  constructor() {
    this.strokes = new Map(); // strokeId -> stroke
    this.transient = new Map(); // strokeId -> stroke while drawing
    this.history = []; // array of ops
    this.historyPointer = 0; // number of applied ops (0..history.length)
  }

  // transient stroke helpers
  startTransientStroke(strokeId, meta) {
    const stroke = {
      id: strokeId,
      userId: meta.userId,
      color: meta.color,
      width: meta.width,
      tool: meta.tool || "brush",
      points: [],
    };
    this.transient.set(strokeId, stroke);
  }

  appendTransientPoints(strokeId, points) {
    const s = this.transient.get(strokeId);
    if (!s) return;
    s.points.push(...points);
  }

  finalizeTransientStroke(strokeId) {
    const s = this.transient.get(strokeId);
    if (!s) return null;
    this.transient.delete(strokeId);
    const stroke = { ...s, points: s.points.slice() };
    // Insert into permanent strokes and return stroke for op creation by caller
    this.strokes.set(stroke.id, stroke);
    return stroke;
  }

  // visible strokes list
  getVisibleStrokes() {
    return Array.from(this.strokes.values());
  }

  // history / ops
  // apply an op to server state (mutates strokes map)
  applyOpDirect(op) {
    if (!op) return;
    if (op.type === "add") {
      // op.stroke must exist
      this.strokes.set(op.stroke.id, op.stroke);
    } else if (op.type === "remove") {
      // remove the stroke; but keep its data in op.removedStroke for redo
      const removed = this.strokes.get(op.strokeId);
      if (removed) {
        // if op doesn't already have removedStroke, attach it
        if (!op.removedStroke) op.removedStroke = removed;
        this.strokes.delete(op.strokeId);
      } else {
        // nothing to remove (maybe already removed) — keep op as-is
      }
    } else {
      console.warn("Unknown op.type", op && op.type);
    }
  }

  // push a new op; drop redo tail if needed
  pushOp(op) {
    // normalize: ensure remove ops have removedStroke if they correspond to an existing stroke
    if (op.type === "remove" && !op.removedStroke) {
      const removed = this.strokes.get(op.strokeId);
      if (removed) op.removedStroke = removed;
    }

    // truncate any "redoable" ops beyond pointer because new op invalidates redo branch
    if (this.historyPointer < this.history.length) {
      this.history = this.history.slice(0, this.historyPointer);
    }
    this.history.push(op);
    // apply this op to state
    this.applyOpDirect(op);
    this.historyPointer++;

    // prune old history if too large (keep strokes state as-is)
    if (this.history.length > MAX_HISTORY) {
      const overflow = this.history.length - MAX_HISTORY;
      this.history.splice(0, overflow);
      this.historyPointer = Math.max(0, this.historyPointer - overflow);
    }
  }

  // inverse op for undo
  inverseOf(op) {
    if (!op) return null;
    if (op.type === "add") {
      return {
        type: "remove",
        strokeId: op.stroke.id,
        removedStroke: op.stroke,
      };
    } else if (op.type === "remove") {
      // we need to restore the removed stroke (assume op.removedStroke exists)
      if (!op.removedStroke) {
        console.warn(
          "remove op missing removedStroke; cannot inverse accurately"
        );
        return null;
      }
      return { type: "add", stroke: op.removedStroke };
    }
    return null;
  }

  // undo last applied op
  undo() {
    if (this.historyPointer === 0) return null; // nothing applied
    // The op to undo is the last applied op at historyPointer - 1
    const toUndo = this.history[this.historyPointer - 1];
    const inverse = this.inverseOf(toUndo);
    if (!inverse) {
      // if cannot compute inverse, skip and still move pointer (defensive)
      this.historyPointer--;
      return null;
    }
    // apply inverse to server state
    this.applyOpDirect(inverse);
    // move pointer back (we consider that op as now not-applied)
    this.historyPointer--;
    // Important: do NOT append inverse to history. History remains the original sequence.
    return { appliedOp: inverse };
  }

  // redo next op (if any)
  redo() {
    if (this.historyPointer >= this.history.length) return null;
    const op = this.history[this.historyPointer];
    // apply it
    this.applyOpDirect(op);
    this.historyPointer++;
    return { appliedOp: op };
  }

  // drop any in-progress strokes for a user (called on disconnect)
  cancelTransientsByUser(userId) {
    for (const [id, s] of this.transient) {
      if (s.userId === userId) this.transient.delete(id);
    }
  }
}
export default DrawingState;
