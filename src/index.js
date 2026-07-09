import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager.js';

const app = express();
const httpServer = createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['*'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
}));
app.use(express.json());

const roomManager = new RoomManager();

app.get('/health', (_, res) => res.json({ ok: true }));

function emitGameState(room) {
  for (const player of room.players) {
    if (player.socketId) {
      io.to(player.socketId).emit('game:state', {
        lobby: roomManager.getLobbyState(room),
        game: room.game ? room.game.getStateForPlayer(player.id) : null,
      });
    }
  }
}

io.on('connection', (socket) => {
  let playerId = null;
  let playerName = 'Игрок';

  socket.on('player:init', ({ id, name }) => {
    playerId = id || socket.id;
    playerName = name || 'Игрок';
    const room = roomManager.setSocket(playerId, socket.id);
    if (room) {
      socket.join(room.id);
      emitGameState(room);
    }
  });

  socket.on('room:create', (data, callback) => {
    playerId = data?.id || socket.id;
    playerName = data?.name || 'Игрок';
    const room = roomManager.createRoom(playerId, playerName);
    roomManager.setSocket(playerId, socket.id);
    socket.join(room.id);
    callback?.({ ok: true, room: roomManager.getLobbyState(room) });
    emitGameState(room);
  });

  socket.on('room:join', (data, callback) => {
    playerId = data?.id || socket.id;
    playerName = data?.name || 'Игрок';
    const result = roomManager.joinRoom(data.roomId, playerId, playerName);
    if (!result.ok) {
      callback?.(result);
      return;
    }
    roomManager.setSocket(playerId, socket.id);
    socket.join(result.room.id);
    callback?.({ ok: true, room: roomManager.getLobbyState(result.room) });
    emitGameState(result.room);
  });

  socket.on('game:start', (callback) => {
    const room = roomManager.getRoomByPlayer(playerId);
    if (!room) {
      callback?.({ ok: false, error: 'Вы не в комнате' });
      return;
    }
    const result = roomManager.startGame(room.id, playerId);
    callback?.(result.ok ? { ok: true } : result);
    if (result.ok) emitGameState(room);
  });

  socket.on('game:action', (data, callback) => {
    const result = roomManager.handleAction(playerId, data.action, data.payload || {});
    if (!result.ok) {
      callback?.(result);
      return;
    }
    callback?.({ ok: true });
    emitGameState(result.room);
  });

  socket.on('disconnect', () => {
    if (playerId) {
      const room = roomManager.getRoomByPlayer(playerId);
      roomManager.leaveRoom(playerId);
      if (room) {
        io.to(room.id).emit('room:update', roomManager.getLobbyState(room));
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🃏 Durak server running on http://localhost:${PORT}`);
});

import('./bot.js').then(({ startBot }) => startBot()).catch(() => {});