import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './rooms/RoomManager.js';
import { WalletManager } from './wallet/WalletManager.js';

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

const walletManager = new WalletManager();
const roomManager = new RoomManager(walletManager);

app.get('/health', (_, res) => res.json({ ok: true }));
app.get('/api/rooms', (_, res) => res.json(roomManager.getPublicRooms()));

function broadcastPublicRooms() {
  io.emit('rooms:list', roomManager.getPublicRooms());
}

function emitWallet(socket, playerId) {
  if (!playerId || !socket) return;
  socket.emit('wallet:update', { balance: walletManager.getBalance(playerId) });
}

function emitGameState(room) {
  for (const player of room.players) {
    if (player.socketId) {
      const sock = io.sockets.sockets.get(player.socketId);
      io.to(player.socketId).emit('game:state', {
        lobby: roomManager.getLobbyState(room),
        game: room.game ? room.game.getStateForPlayer(player.id) : null,
      });
      emitWallet(sock, player.id);
    }
  }
}

function notifyRoomUpdate(room) {
  if (!room) return;
  const lobby = roomManager.getLobbyState(room);
  io.to(room.id).emit('room:update', lobby);
  if (room.isPublic) broadcastPublicRooms();
}

io.on('connection', (socket) => {
  let playerId = null;
  let playerName = 'Игрок';

  socket.emit('rooms:list', roomManager.getPublicRooms());

  socket.on('player:init', ({ id, name }) => {
    playerId = id || socket.id;
    playerName = name || 'Игрок';
    const room = roomManager.setSocket(playerId, socket.id);
    emitWallet(socket, playerId);
    if (room) {
      socket.join(room.id);
      emitGameState(room);
    }
  });

  socket.on('rooms:list', (callback) => {
    const rooms = roomManager.getPublicRooms();
    callback?.(rooms);
    socket.emit('rooms:list', rooms);
  });

  socket.on('room:create', (data, callback) => {
    playerId = data?.id || socket.id;
    playerName = data?.name || 'Игрок';
    const result = roomManager.createRoom(playerId, playerName, {
      isPublic: data?.isPublic,
      maxPlayers: data?.maxPlayers,
      deckSize: data?.deckSize,
      gameMode: data?.gameMode,
      allowCheating: data?.allowCheating,
      entryFee: data?.entryFee,
    });
    if (!result.ok) {
      callback?.(result);
      emitWallet(socket, playerId);
      return;
    }
    const room = result.room;
    roomManager.setSocket(playerId, socket.id);
    socket.join(room.id);
    callback?.({ ok: true, room: roomManager.getLobbyState(room) });
    emitGameState(room);
    emitWallet(socket, playerId);
    if (room.isPublic) broadcastPublicRooms();
  });

  socket.on('room:join', (data, callback) => {
    playerId = data?.id || socket.id;
    playerName = data?.name || 'Игрок';
    const result = roomManager.joinRoom(data.roomId, playerId, playerName);
    if (!result.ok) {
      callback?.(result);
      emitWallet(socket, playerId);
      return;
    }
    roomManager.setSocket(playerId, socket.id);
    socket.join(result.room.id);
    callback?.({ ok: true, room: roomManager.getLobbyState(result.room) });
    emitGameState(result.room);
    emitWallet(socket, playerId);
    notifyRoomUpdate(result.room);
  });

  socket.on('room:leave', (callback) => {
    const result = roomManager.leaveRoom(playerId);
    socket.leaveAll();
    callback?.({ ok: true });
    emitWallet(socket, playerId);
    if (result?.room) {
      notifyRoomUpdate(result.room);
      emitGameState(result.room);
    } else if (result?.wasPublic) {
      broadcastPublicRooms();
    }
    socket.emit('game:state', { lobby: null, game: null });
  });

  socket.on('game:start', (callback) => {
    const room = roomManager.getRoomByPlayer(playerId);
    if (!room) {
      callback?.({ ok: false, error: 'Вы не в комнате' });
      return;
    }
    const result = roomManager.startGame(room.id, playerId);
    callback?.(result.ok ? { ok: true } : result);
    if (result.ok) {
      emitGameState(room);
      if (room.isPublic) broadcastPublicRooms();
    }
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

  socket.on('game:rematch', (callback) => {
    const result = roomManager.rematch(playerId);
    if (!result.ok) {
      callback?.(result);
      return;
    }
    callback?.({ ok: true });
    emitGameState(result.room);
  });

  socket.on('game:reaction', (data) => {
    const room = roomManager.getRoomByPlayer(playerId);
    if (!room) return;
    socket.to(room.id).emit('game:reaction', {
      emoji: data?.emoji,
      from: playerId,
      fromName: playerName,
    });
  });

  socket.on('disconnect', () => {
    if (playerId) {
      const result = roomManager.leaveRoom(playerId);
      if (result?.room) {
        notifyRoomUpdate(result.room);
      } else if (result?.wasPublic) {
        broadcastPublicRooms();
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🃏 Durak server running on http://localhost:${PORT}`);
});

import('./bot.js').then(({ startBot }) => startBot()).catch(() => {});