// Basic express + socket.io setup for the canvas app.
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import RoomManager from "./rooms.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Just one room for now. Could add more later.
const rooms = new RoomManager();
const defaultRoom = rooms.createRoom("main");

io.on("connection", (socket) => {
  const userId = socket.id;
  const room = defaultRoom;
  console.log("connect", userId);

  socket.join(room.id);
  room.addClient(userId);

  socket.emit("room:joined", {
    roomId: room.id,
    strokes: room.state.getVisibleStrokes(),
    historyPointer: room.state.historyPointer,
  });

  socket.to(room.id).emit("user:join", { userId });

  socket.on("cursor", (payload) => {
    socket.to(room.id).emit("cursor", { ...payload, userId });
  });

  socket.on("stroke:start", (payload) => {
    socket.to(room.id).emit("stroke:start", { ...payload, userId });
    room.state.startTransientStroke(payload.strokeId, payload);
  });

  socket.on("stroke:chunk", (payload) => {
    socket.to(room.id).emit("stroke:chunk", { ...payload, userId });
    room.state.appendTransientPoints(payload.strokeId, payload.points);
  });

  socket.on("stroke:end", (payload) => {
    const stroke = room.state.finalizeTransientStroke(payload.strokeId);
    if (stroke) {
      const op = { type: "add", stroke };
      room.state.pushOp(op);
      io.in(room.id).emit("apply_op", {
        op,
        historyPointer: room.state.historyPointer,
      });
    } else {
      console.warn("stroke:end without transient", payload.strokeId);
    }
    socket
      .to(room.id)
      .emit("stroke:end", { strokeId: payload.strokeId, userId });
  });

  // request: undo / redo (global)
  socket.on("undo", () => {
    const res = room.state.undo();
    if (res && res.appliedOp) {
      io.in(room.id).emit("apply_op", {
        op: res.appliedOp,
        historyPointer: room.state.historyPointer,
      });
    } else {
      socket.emit("no-op", { reason: "nothing-to-undo" });
    }
  });

  socket.on("redo", () => {
    const res = room.state.redo();
    if (res && res.appliedOp) {
      io.in(room.id).emit("apply_op", {
        op: res.appliedOp,
        historyPointer: room.state.historyPointer,
      });
    } else {
      socket.emit("no-op", { reason: "nothing-to-redo" });
    }
  });
  // client requests full reset or request history slice
  socket.on("request:state", () => {
    socket.emit("room:state", {
      strokes: room.state.getVisibleStrokes(),
      historyPointer: room.state.historyPointer,
    });
  });

  socket.on("disconnect", () => {
    console.log("disconnect", userId);
    // clear any in-progress strokes from this user
    room.state.cancelTransientsByUser(userId);
    room.removeClient(userId);
    socket.to(room.id).emit("user:left", { userId });
  });
});

server.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
