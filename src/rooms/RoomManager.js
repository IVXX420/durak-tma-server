import { v4 as uuidv4 } from 'uuid';
import { DurakGame } from '../game/DurakGame.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map();
  }

  createRoom(hostId, hostName) {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    const room = {
      id: roomId,
      players: [{ id: hostId, name: hostName, socketId: null }],
      game: null,
      status: 'waiting',
      createdAt: Date.now(),
    };
    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);
    return room;
  }

  joinRoom(roomId, playerId, playerName) {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return { ok: false, error: 'Комната не найдена' };
    if (room.status !== 'waiting') return { ok: false, error: 'Игра уже началась' };
    if (room.players.length >= 2) return { ok: false, error: 'Комната полна' };
    if (room.players.some(p => p.id === playerId)) {
      return { ok: true, room };
    }

    room.players.push({ id: playerId, name: playerName, socketId: null });
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
    if (room.players[0].id !== playerId) return { ok: false, error: 'Только хост может начать' };
    if (room.players.length < 2) return { ok: false, error: 'Нужен второй игрок' };

    const playerIds = room.players.map(p => p.id);
    room.game = new DurakGame(playerIds);
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
      case 'take':
        result = room.game.take(playerId);
        break;
      case 'pass':
        result = room.game.pass(playerId);
        break;
      default:
        return { ok: false, error: 'Неизвестное действие' };
    }

    return { ...result, room };
  }

  getLobbyState(room) {
    return {
      id: room.id,
      status: room.status,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
    };
  }

  leaveRoom(playerId) {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter(p => p.id !== playerId);
    this.playerRooms.delete(playerId);

    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    } else if (room.status === 'playing') {
      room.status = 'finished';
      if (room.game) {
        room.game.status = 'finished';
        room.game.winner = room.players[0].id;
      }
    }
  }
}