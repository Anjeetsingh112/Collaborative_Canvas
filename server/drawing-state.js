
const MAX_HISTORY = 2000; // cap to avoid unbounded memory growth

class DrawingState {
  constructor() {
    this.strokes = new Map(); // strokeId -> stroke
    this.transient = new Map(); // strokeId -> stroke while drawing
    this.history = []; 
    this.historyPointer = 0;
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
    this.strokes.set(stroke.id, stroke);
    return stroke;
  }

  getVisibleStrokes() {
    return Array.from(this.strokes.values());
  }

  applyOpDirect(op) {
    if (!op) return;
    if (op.type === "add") {
      this.strokes.set(op.stroke.id, op.stroke);
    } else if (op.type === "remove") {
      const removed = this.strokes.get(op.strokeId);
      if (removed) {
        if (!op.removedStroke) op.removedStroke = removed;
        this.strokes.delete(op.strokeId);
      } else {
      }
    } else {
      console.warn("Unknown op.type", op && op.type);
    }
  }

  pushOp(op) {
    if (op.type === "remove" && !op.removedStroke) {
      const removed = this.strokes.get(op.strokeId);
      if (removed) op.removedStroke = removed;
    }

    if (this.historyPointer < this.history.length) {
      this.history = this.history.slice(0, this.historyPointer);
    }
    this.history.push(op);
    this.applyOpDirect(op);
    this.historyPointer++;

    if (this.history.length > MAX_HISTORY) {
      const overflow = this.history.length - MAX_HISTORY;
      this.history.splice(0, overflow);
      this.historyPointer = Math.max(0, this.historyPointer - overflow);
    }
  }

  inverseOf(op) {
    if (!op) return null;
    if (op.type === "add") {
      return {
        type: "remove",
        strokeId: op.stroke.id,
        removedStroke: op.stroke,
      };
    } else if (op.type === "remove") {
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

  undo() {
    if (this.historyPointer === 0) return null;
    const toUndo = this.history[this.historyPointer - 1];
    const inverse = this.inverseOf(toUndo);
    if (!inverse) {
      this.historyPointer--;
      return null;
    }
    this.applyOpDirect(inverse);
    this.historyPointer--;
    return { appliedOp: inverse };
  }
  redo() {
    if (this.historyPointer >= this.history.length) return null;
    const op = this.history[this.historyPointer];
    this.applyOpDirect(op);
    this.historyPointer++;
    return { appliedOp: op };
  }

  cancelTransientsByUser(userId) {
    for (const [id, s] of this.transient) {
      if (s.userId === userId) this.transient.delete(id);
    }
  }
}
export default DrawingState;
