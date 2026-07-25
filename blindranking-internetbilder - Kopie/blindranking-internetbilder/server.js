import express from "express";
import http from "http";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5_000_000 });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const MAX_IMAGES = 10;
const rooms = new Map();

app.use(express.static(path.join(__dirname, "public")));

function clean(value, max = 60) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  const revealedImages = [...room.images.values()]
    .filter(image => image.revealed)
    .sort((a, b) => a.order - b.order);

  return {
    code: room.code,
    theme: room.theme,
    hostId: room.hostId,
    players: [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt),
    images: revealedImages,
    rankings: room.rankings,
    currentImageId: room.currentImageId,
    totalImages: room.images.size,
    hiddenImages: [...room.images.values()].filter(image => !image.revealed).length
  };
}

function emitRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;

  if (!room) return;

  room.players.delete(socket.id);
  delete room.rankings[socket.id];

  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }

  emitRoom(room);
}

io.on("connection", socket => {
  socket.on("room:create", (payload, callback) => {
    leaveRoom(socket);

    const name = clean(payload?.name, 20);
    const theme = clean(payload?.theme, 60);

    if (!name || !theme) {
      return callback?.({ ok: false, error: "Bitte Name und Thema eingeben." });
    }

    const code = createRoomCode();
    const room = {
      code,
      theme,
      hostId: socket.id,
      players: new Map(),
      images: new Map(),
      rankings: {},
      currentImageId: null,
      nextOrder: 1
    };

    room.players.set(socket.id, {
      id: socket.id,
      name,
      joinedAt: Date.now()
    });
    room.rankings[socket.id] = {};

    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;

    callback?.({
      ok: true,
      playerId: socket.id,
      room: publicRoom(room)
    });

    emitRoom(room);
  });

  socket.on("room:join", (payload, callback) => {
    leaveRoom(socket);

    const code = clean(payload?.code, 6).toUpperCase();
    const name = clean(payload?.name, 20);
    const room = rooms.get(code);

    if (!room) {
      return callback?.({ ok: false, error: "Raum nicht gefunden." });
    }
    if (!name) {
      return callback?.({ ok: false, error: "Bitte einen Namen eingeben." });
    }
    if (room.players.size >= MAX_PLAYERS) {
      return callback?.({ ok: false, error: "Der Raum ist bereits voll." });
    }

    room.players.set(socket.id, {
      id: socket.id,
      name,
      joinedAt: Date.now()
    });
    room.rankings[socket.id] = {};

    socket.join(code);
    socket.data.roomCode = code;

    callback?.({
      ok: true,
      playerId: socket.id,
      room: publicRoom(room)
    });

    emitRoom(room);
  });

  socket.on("image:add", (payload, callback) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) return callback?.({ ok: false, error: "Kein Raum aktiv." });
    if (room.hostId !== socket.id) {
      return callback?.({ ok: false, error: "Nur der Host darf Bilder hochladen." });
    }
    if (room.images.size >= MAX_IMAGES) {
      return callback?.({ ok: false, error: "Maximal 10 Bilder sind erlaubt." });
    }

    const dataUrl = String(payload?.dataUrl ?? "");
    const imageUrl = String(payload?.imageUrl ?? "").trim();

    let src = "";

    if (dataUrl) {
      if (!dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > 4_500_000) {
        return callback?.({ ok: false, error: "Das Bild ist ungültig oder zu groß." });
      }
      src = dataUrl;
    } else if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        if (!["http:", "https:"].includes(parsed.protocol) || imageUrl.length > 2000) {
          throw new Error("invalid");
        }
        src = imageUrl;
      } catch {
        return callback?.({ ok: false, error: "Bitte eine gültige Bild-URL verwenden." });
      }
    } else {
      return callback?.({ ok: false, error: "Es wurde kein Bild übergeben." });
    }

    const id = crypto.randomUUID();
    room.images.set(id, {
      id,
      src,
      revealed: false,
      order: room.nextOrder++
    });

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("image:reveal-next", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) return callback?.({ ok: false, error: "Kein Raum aktiv." });
    if (room.hostId !== socket.id) {
      return callback?.({ ok: false, error: "Nur der Host darf Bilder aufdecken." });
    }

    const next = [...room.images.values()]
      .sort((a, b) => a.order - b.order)
      .find(image => !image.revealed);

    if (!next) {
      return callback?.({ ok: false, error: "Es sind keine verdeckten Bilder mehr vorhanden." });
    }

    next.revealed = true;
    room.currentImageId = next.id;

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("rank:set", (payload, callback) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) return callback?.({ ok: false, error: "Kein Raum aktiv." });
    if (room.hostId !== socket.id) {
      return callback?.({ ok: false, error: "Nur der Host darf Bilder platzieren." });
    }

    const imageId = String(payload?.imageId ?? "");
    const targetPlayerId = String(payload?.targetPlayerId ?? "");
    const rank = Number(payload?.rank);

    const image = room.images.get(imageId);

    if (!image?.revealed) {
      return callback?.({ ok: false, error: "Dieses Bild ist noch verdeckt." });
    }
    if (!room.players.has(targetPlayerId)) {
      return callback?.({ ok: false, error: "Spieler nicht gefunden." });
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) {
      return callback?.({ ok: false, error: "Ungültiger Rang." });
    }

    const ranking = room.rankings[targetPlayerId] ?? {};

    for (const [otherImageId, otherRank] of Object.entries(ranking)) {
      if (otherImageId !== imageId && otherRank === rank) {
        delete ranking[otherImageId];
      }
    }

    ranking[imageId] = rank;
    room.rankings[targetPlayerId] = ranking;

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("rank:remove", (payload, callback) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) return callback?.({ ok: false, error: "Kein Raum aktiv." });
    if (room.hostId !== socket.id) {
      return callback?.({ ok: false, error: "Nur der Host darf Bilder entfernen." });
    }

    const imageId = String(payload?.imageId ?? "");
    const targetPlayerId = String(payload?.targetPlayerId ?? "");
    const ranking = room.rankings[targetPlayerId];

    if (ranking) delete ranking[imageId];

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("game:reset", (_, callback) => {
    const room = rooms.get(socket.data.roomCode);

    if (!room) return callback?.({ ok: false, error: "Kein Raum aktiv." });
    if (room.hostId !== socket.id) {
      return callback?.({ ok: false, error: "Nur der Host darf das Spiel zurücksetzen." });
    }

    room.images.clear();
    room.currentImageId = null;
    room.nextOrder = 1;

    for (const playerId of room.players.keys()) {
      room.rankings[playerId] = {};
    }

    callback?.({ ok: true });
    emitRoom(room);
  });

  socket.on("room:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Blindranking läuft auf http://localhost:${PORT}`);
});
