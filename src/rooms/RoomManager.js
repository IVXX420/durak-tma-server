import { v4 as uuidv4 } from 'uuid';
import { DurakGame } from '../game/DurakGame.js';

function gameOptionsFromRoom(room) {
  return {
    deckSize: room.deckSize,
    gameMode: room.gameMode,
    allowCheating: room.allowCheating,
  };
}

export class RoomManager {
  constructor(walletManager) {
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.wallet = walletManager;
  }

  createRoom(hostId, hostName, options = {}) {
    const isPublic = options.isPublic === true
      || options.isPublic === 'true'
      || options.public === true;
    const maxPlayers = Math.min(Math.max(options.maxPlayers || 2, 2), 4);
    const deckSize = [24, 36, 52].includes(options.deckSize) ? options.deckSize : 36;
    let gameMode = options.gameMode === 'perevodnoy' ? 'perevodnoy' : 'podkidnoy';
    if (gameMode === 'perevodnoy' && maxPlayers < 3) gameMode = 'podkidnoy';
    const entryFee = Math.max(0, Math.min(options.entryFee || 0, 5000));
    const allowCheating = Boolean(options.allowCheating);

    if (entryFee > 0) {
      const pay = this.wallet.deduct(hostId, entryFee);
      if (!pay.ok) return { ok: false, error: pay.error };
    }

    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const room = {
      id: roomId,
      players: [{ id: hostId, name: hostName, socketId: null, paidEntry: entryFee }],
      game: null,
      status: 'waiting',
      isPublic,
      maxPlayers,
      deckSize,
      gameMode,
      allowCheating,
      entryFee,
      hostId,
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);
    return { ok: true, room };
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return { ok: false, error: 'Комната не найдена' };
    if (room.status !== 'waiting') return { ok: false, error: 'Игра уже началась' };
    if (room.players.length >= room.maxPlayers) {
      return { ok: false, error: 'Комната полна' };
    }
    if (room.players.some(p => p.id === playerId)) {
      return { ok: true, room };
    }

    if (room.entryFee > 0) {
      const pay = this.wallet.deduct(playerId, room.entryFee);
      if (!pay.ok) return { ok: false, error: pay.error };
    }

    room.players.push({
      id: playerId,
      name: playerName,
      socketId: null,
      paidEntry: room.entryFee,
    });
    this.playerRooms.set(playerId, room.id);
    return { ok: true, room };
  }

  setSocket(playerId, socketId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.socketId = socketId;
    return room;
  }

  startGame(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: 'Комната не найдена' };
    if (room.hostId !== playerId) return { ok: false, error: 'Только хост может начать' };
    if (room.players.length < 2) return { ok: false, error: 'Нужно минимум 2 игрока' };

    const playerIds = room.players.map(p => p.id);
    room.game = new DurakGame(playerIds, gameOptionsFromRoom(room));
    room.status = 'playing';
    return { ok: true, room };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomByPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  getPublicRooms() {
    return Array.from(this.rooms.values())
      .filter(r => r.isPublic && r.status === 'waiting')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => this.getPublicRoomState(r));
  }

  getPublicRoomState(room) {
    return {
      id: room.id,
      hostName: room.players[0]?.name || 'Хост',
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      deckSize: room.deckSize,
      gameMode: room.gameMode,
      allowCheating: room.allowCheating,
      entryFee: room.entryFee,
    };
  }

  payWinner(room) {
    if (!room.game || room.game.status !== 'finished') return;
    let winner = room.game.winner;
    if (!winner && room.game.fool) {
      winner = room.game.playerIds.find(id => id !== room.game.fool);
    }
    if (!winner) return;

    const pot = room.players.reduce((sum, p) => sum + (p.paidEntry || 0), 0);
    if (pot > 0) this.wallet.add(winner, pot);
  }

  rematch(playerId) {
    const room = this.getRoomByPlayer(playerId);
    if (!room) return { ok: false, error: 'Комната не найдена' };
    if (!room.game || room.game.status !== 'finished') {
      return { ok: false, error: 'Игра ещё не окончена' };
    }
    const playerIds = room.players.map(p => p.id);
    room.game = new DurakGame(playerIds, gameOptionsFromRoom(room));
    room.status = 'playing';
    return { ok: true, room };
  }

  handleAction(playerId, action, payload) {
    const room = this.getRoomByPlayer(playerId);
    if (!room || !room.game) return { ok: false, error: 'Игра не найдена' };

    let result;
    switch (action) {
      case 'attack':
        result = room.game.attack(playerId, payload.cardId);
        break;
      case 'defend':
        result = room.game.defend(playerId, payload.cardId, payload.attackIndex);
        break;
      case 'translate':
        result = room.game.translate(playerId, payload.cardId);
        break;
      case 'challenge':
        result = room.game.challenge(playerId, payload.attackIndex);
        break;
      case 'take':
        result = room.game.take(playerId);
        break;
      case 'pass':
        result = room.game.pass(playerId);
        break;
      default:
        return { ok: false, error: 'Неизвестное действие' };
    }

    if (result.ok && room.game.status === 'finished') {
      this.payWinner(room);
    }

    return { ...result, room };
  }

  getLobbyState(room) {
    return {
      id: room.id,
      status: room.status,
      isPublic: room.isPublic,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      deckSize: room.deckSize,
      gameMode: room.gameMode,
      allowCheating: room.allowCheating,
      entryFee: room.entryFee,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
    };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const leaving = room.players.find(p => p.id === playerId);
    const wasPublic = room.isPublic;

    if (room.status === 'waiting' && leaving?.paidEntry > 0) {
      this.wallet.add(playerId, leaving.paidEntry);
    }

    room.players = room.players.filter(p => p.id !== playerId);
    this.playerRooms.delete(playerId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return { room: null, wasPublic };
    }

    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
    }

    if (room.status === 'playing') {
      room.status = 'finished';
      if (room.game) {
        room.game.status = 'finished';
        room.game.winner = room.players[0].id;
      }
    }

    return { room, wasPublic };
  }
}