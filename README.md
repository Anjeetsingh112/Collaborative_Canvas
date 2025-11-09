# Real-Time Collaborative Drawing Canvas

Multi-user canvas with live strokes, undo/redo, and a simple room. Plain JS on the client, Node + Socket.io on the server.

## Features

- Live drawing (stroke start/chunks/end broadcast as you draw)
- Brush and eraser (eraser uses canvas compositing)
- Color and width controls
- Global undo/redo
- Remote cursors (see where others are)

## Stack

- Frontend: HTML, CSS, Vanilla JS (Canvas API)
- Backend: Node.js, Express, Socket.io (ESM)

## Setup

```powershell
npm install
npm run dev


Server runs on http://localhost:3000 and serves the client from `client/`.

## How to test with multiple users
- Open two browser windows (or a window and an incognito window) at http://localhost:3000
- Draw in one; you should see strokes appear in the other in real-time
- Try Undo/Redo – it affects the shared canvas

## Known limitations
- One room only, no persistence (refresh clears)
- Simple history cap on the server to avoid memory growth
- No auth; socket.id is used as a lightweight user id

## Time spent
- Planning/wiring: ~1–2h
- Canvas + streaming: ~2–3h
- Undo/redo + fixes: ~1–2h
- Polish/docs: ~0.5–1h

## Scripts
- `npm run dev` – start server with nodemon
- `npm start` – start server with node

## Folder structure
```

collaborative-canvas/
client/
index.html
style.css
canvas.js
main.js
server/
server.js
rooms.js
drawing-state.js
package.json
README.md
ARCHITECTURE.md

```

```
