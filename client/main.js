// client/main.js
// Wiring: pointer events, batching, prediction, sending to server.

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
setTool("brush"); // default

// utility: uuid generator (simple)
function uuid() {
  return "s-" + Math.random().toString(36).slice(2, 9);
}

// buffer for local points to batch-send
let localPointBuffer = [];
let sendTimer = null;

// when socket connects set status and id
socket.on("connect", () => {
  myUserId = socket.id;
  STATUS.innerText = "Connected: " + myUserId.slice(0, 6);
  CanvasApp.init(socket);
});

// pointer handling for mouse + touch
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
    drawing = true; // IMPORTANT!
    const p = getPos(e);
    currentStrokeId = uuid();

    // Determine stroke color and tool (eraser handled via compositing in canvas)
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

    // start timer to flush buffer
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
    localPointBuffer.push(p);
    CanvasApp.appendLocalPoints([p]);
    sendCursor(p.x, p.y);
  }

  function end(e) {
    if (!drawing) return;
    e.preventDefault();
    // flush remaining buffer
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

  // support touch
  canvasEl.addEventListener("touchstart", start, { passive: false });
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("touchend", end);
})();

// Undo / Redo buttons
UNDO_BTN.addEventListener("click", () => socket.emit("undo"));
REDO_BTN.addEventListener("click", () => socket.emit("redo"));

// log server no-op messages
socket.on("no-op", (payload) => {
  console.log("server no-op", payload);
});
