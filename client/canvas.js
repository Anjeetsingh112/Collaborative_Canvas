// client/canvas.js — canvas drawing + socket reactions

const CanvasApp = (function () {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  // internal state
  const strokes = new Map(); // strokeId -> stroke
  const cursors = new Map(); // userId -> {x,y,color}
  let localStroke = null;
  let drawing = false;

  // visual settings
  function resize() {
    // adapt canvas internal resolution to device pixel ratio
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawAll();
  }

  function redrawAll() {
    // clear and draw all strokes
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    // draw strokes in insertion order
    for (const s of strokes.values()) {
      drawStroke(ctx, s);
    }
  }

  function drawStroke(ctx, stroke) {
    if (!stroke || !stroke.points || stroke.points.length === 0) return;
    // brush vs eraser
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation =
      stroke.tool === "eraser" ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color || "#fff";
    ctx.lineWidth = stroke.width || 3;
    ctx.beginPath();
    const pts = stroke.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      // simple smoothing: midpoints
      const midX = (pts[i - 1].x + pts[i].x) / 2;
      const midY = (pts[i - 1].y + pts[i].y) / 2;
      ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, midX, midY);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = prevComp;
  }

  // network handlers: stroke:start / chunk / end / apply_op
  function attachNetwork(socket) {
    socket.on("stroke:start", (payload) => {
      // create remote transient
      strokes.set(payload.strokeId, {
        id: payload.strokeId,
        userId: payload.userId,
        color: payload.color,
        width: payload.width,
        tool: payload.tool || "brush",
        points: [],
      });
    });

    socket.on("stroke:chunk", (payload) => {
      const s = strokes.get(payload.strokeId);
      if (!s) {
        // if not exists, create (defensive)
        strokes.set(payload.strokeId, {
          id: payload.strokeId,
          userId: payload.userId,
          color: "#fff",
          width: 3,
          tool: "brush",
          points: [],
        });
      }
      const ss = strokes.get(payload.strokeId);
      ss.points.push(...payload.points);
      redrawAll();
    });

    socket.on("stroke:end", (payload) => {
      // finalize remote stroke (no-op, strokes already contains it)
      redrawAll();
    });

    // apply_op: server tells clients to apply an op (add/remove)
    socket.on("apply_op", ({ op, historyPointer }) => {
      if (op.type === "add") {
        strokes.set(op.stroke.id, op.stroke);
      } else if (op.type === "remove") {
        strokes.delete(op.strokeId);
      }
      redrawAll();
      // update history UI if needed
      // (we don't show pointer in UI in this simple client)
    });

    socket.on("room:joined", (payload) => {
      // initial state
      strokes.clear();
      for (const s of payload.strokes) strokes.set(s.id, s);
      redrawAll();
    });

    socket.on("room:state", (payload) => {
      strokes.clear();
      for (const s of payload.strokes) strokes.set(s.id, s);
      redrawAll();
    });

    // cursors
    socket.on("cursor", (payload) => {
      cursors.set(payload.userId, payload);
      showCursors();
    });

    socket.on("user:left", ({ userId }) => {
      cursors.delete(userId);
      removeCursorElement(userId);
    });

    socket.on("user:join", ({ userId }) => {
      // optional: show presence
    });
  }

  // UI cursors drawn as DOM elements for clarity
  function showCursors() {
    for (const [userId, info] of cursors) {
      let el = document.getElementById("cursor-" + userId);
      if (!el) {
        el = document.createElement("div");
        el.className = "user-cursor";
        el.id = "cursor-" + userId;
        el.innerText = userId.slice(0, 4);
        document.getElementById("canvas-wrap").appendChild(el);
      }
      el.style.left = info.x + "px";
      el.style.top = info.y + "px";
      el.style.background = info.color || "transparent";
      el.style.padding = "4px 6px";
      el.style.borderRadius = "6px";
      el.style.color = "#fff";
    }
  }
  function removeCursorElement(userId) {
    const el = document.getElementById("cursor-" + userId);
    if (el) el.remove();
  }

  // public: start local drawing
  function startLocalStroke(strokeMeta) {
    localStroke = {
      id: strokeMeta.strokeId,
      userId: strokeMeta.userId,
      color: strokeMeta.color,
      width: strokeMeta.width,
      tool: strokeMeta.tool || "brush",
      points: [],
    };
    strokes.set(localStroke.id, localStroke);
  }

  function appendLocalPoints(points) {
    if (!localStroke) return;
    localStroke.points.push(...points);
    drawStroke(ctx, localStroke);
  }

  function endLocalStroke() {
    localStroke = null;
  }

  return {
    init: function (socket) {
      attachNetwork(socket);
      resize();
      window.addEventListener("resize", resize);
    },
    startLocalStroke,
    appendLocalPoints,
    endLocalStroke,
    sendFullRedraw: redrawAll,
    getCanvasBoundingRect: () => canvas.getBoundingClientRect(),
    getCanvasElement: () => canvas,
  };
})();
