// client/main.js
const socket = io();

const COLOR_INPUT = document.getElementById("color");
const WIDTH_INPUT = document.getElementById("width");
const BRUSH_BTN = document.getElementById("brush");
const ERASER_BTN = document.getElementById("eraser");
const UNDO_BTN = document.getElementById("undo");
const REDO_BTN = document.getElementById("redo");
const STATUS = document.getElementById("status");

let myUserId = null;
let sendInterval = 50; // ms batching of points while drawing
let drawing = false;

// tool selection
let currentTool = "brush";
function setTool(tool) {
  currentTool = tool;
  BRUSH_BTN.classList.toggle("active", tool === "brush");
  ERASER_BTN.classList.toggle("active", tool === "eraser");
}
BRUSH_BTN.addEventListener("click", () => setTool("brush"));
ERASER_BTN.addEventListener("click", () => setTool("eraser"));
setTool("brush"); 

// utility: uuid generator (simple)
function uuid() {
  return "s-" + Math.random().toString(36).slice(2, 9);
}

let localPointBuffer = [];
let sendTimer = null;

socket.on("connect", () => {
  myUserId = socket.id;
  STATUS.innerText = "Connected: " + myUserId.slice(0, 6);
  CanvasApp.init(socket);
});

// basic network status updates
socket.io.on("error", (err) => {
  STATUS.innerText = "Network error";
  console.error("socket error", err);
});
socket.io.on("reconnect_attempt", () => {
  STATUS.innerText = "Reconnecting…";
});
socket.io.on("reconnect", () => {
  STATUS.innerText = "Reconnected: " + (socket.id || "");
  // pull fresh state after reconnect
  socket.emit("request:state");
});
socket.on("disconnect", (reason) => {
  STATUS.innerText = "Disconnected" + (reason ? ` (${reason})` : "");
});

(function attachPointer() {
  const canvasEl = CanvasApp.getCanvasElement();
  const canvasRect = () => CanvasApp.getCanvasBoundingRect();

  function getPos(evt) {
    const rect = canvasRect();
    let x, y;
    if (evt.touches && evt.touches[0]) {
      x = evt.touches[0].clientX - rect.left;
      y = evt.touches[0].clientY - rect.top;
    } else {
      x = evt.clientX - rect.left;
      y = evt.clientY - rect.top;
    }
    return { x, y };
  }

  function sendCursor(x, y) {
    socket.emit("cursor", { x, y, color: COLOR_INPUT.value });
  }

  let currentStrokeId = null;

  function start(e) {
    e.preventDefault();
    drawing = true; 
    const p = getPos(e);
    currentStrokeId = uuid();

    const drawColor = COLOR_INPUT.value;

    const meta = {
      strokeId: currentStrokeId,
      color: drawColor,
      width: parseInt(WIDTH_INPUT.value, 10),
      userId: myUserId,
      tool: currentTool,
    };

    CanvasApp.startLocalStroke(meta);
    socket.emit("stroke:start", meta);

    // add first point
    localPointBuffer = [p];
    CanvasApp.appendLocalPoints([p]);
    socket.emit("stroke:chunk", { strokeId: currentStrokeId, points: [p] });

    sendTimer = setInterval(() => {
      if (localPointBuffer.length > 0) {
        socket.emit("stroke:chunk", {
          strokeId: currentStrokeId,
          points: localPointBuffer.splice(0),
        });
      }
    }, sendInterval);
  }

  function move(e) {
    const p = getPos(e);
    if (!drawing) {
      sendCursor(p.x, p.y);
      return;
    }
    e.preventDefault();
    const last =
      localPointBuffer.length > 0
        ? localPointBuffer[localPointBuffer.length - 1]
        : null;
    const dx = last ? p.x - last.x : Infinity;
    const dy = last ? p.y - last.y : Infinity;
    const dist2 = dx * dx + dy * dy;
    if (!last || dist2 > 2.25) {
      // ~1.5px threshold
      localPointBuffer.push(p);
      CanvasApp.appendLocalPoints([p]);
    }
    sendCursor(p.x, p.y);
  }

  function end(e) {
    if (!drawing) return;
    if (e && e.preventDefault) e.preventDefault();
    if (sendTimer) {
      clearInterval(sendTimer);
      sendTimer = null;
    }
    if (localPointBuffer.length > 0) {
      socket.emit("stroke:chunk", {
        strokeId: currentStrokeId,
        points: localPointBuffer.splice(0),
      });
    }
    socket.emit("stroke:end", { strokeId: currentStrokeId });
    CanvasApp.endLocalStroke();
    drawing = false;
    currentStrokeId = null;
  }

  // support mouse
  canvasEl.addEventListener("mousedown", start);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvasEl.addEventListener("mouseleave", end);

  // support touch
  canvasEl.addEventListener("touchstart", start, { passive: false });
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", end);
  window.addEventListener("touchcancel", end);

  // best-effort cleanup if the tab goes away
  window.addEventListener("blur", end);
  window.addEventListener("beforeunload", end);
})();

// Undo / Redo buttons
UNDO_BTN.addEventListener("click", () => socket.emit("undo"));
REDO_BTN.addEventListener("click", () => socket.emit("redo"));

// log server no-op messages
socket.on("no-op", (payload) => {
  console.log("server no-op", payload);
});
