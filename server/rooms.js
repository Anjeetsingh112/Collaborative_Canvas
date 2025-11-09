// Rooms keep track of clients and canvas state.
import DrawingState from "./drawing-state.js";

class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.state = new DrawingState();
  }
  addClient(id) {
    this.clients.add(id);
  }
  removeClient(id) {
    this.clients.delete(id);
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }
  createRoom(id) {
    const r = new Room(id);
    this.rooms.set(id, r);
    return r;
  }
  getRoom(id) {
    return this.rooms.get(id);
  }
}

export default RoomManager;
