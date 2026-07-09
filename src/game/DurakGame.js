import { createDeck, shuffle } from './deck.js';
import { RANK_VALUE } from './types.js';

export class DurakGame {
  constructor(playerIds, options = {}) {
    this.playerIds = playerIds;
    this.deckSize = options.deckSize === 24 ? 24 : 36;
    this.gameMode = options.gameMode === 'perevodnoy' ? 'perevodnoy' : 'podkidnoy';
    this.allowCheating = Boolean(options.allowCheating);
    this.deck = [];
    this.trump = null;
    this.trumpSuit = null;
    this.hands = {};
    this.attackerIndex = 0;
    this.defenderIndex = 1;
    this.table = [];
    this.phase = 'attack';
    this.status = 'playing';
    this.winner = null;
    this.fool = null;
    this.defenderHandSizeAtRoundStart = 0;
    this.roundPassed = false;
    this.lastAction = null;
    this.init();
  }

  init() {
    this.deck = shuffle(createDeck(this.deckSize));
    this.trump = this.deck[this.deck.length - 1];
    this.trumpSuit = this.trump.suit;

    for (const id of this.playerIds) {
      this.hands[id] = [];
    }

    for (let i = 0; i < 6; i++) {
      for (const id of this.playerIds) {
        if (this.deck.length > 0) {
          this.hands[id].push(this.deck.shift());
        }
      }
    }

    this.attackerIndex = this.findLowestTrumpHolder();
    this.defenderIndex = (this.attackerIndex + 1) % this.playerIds.length;
    this.startRound();
  }

  findLowestTrumpHolder() {
    let bestIndex = 0;
    let bestValue = Infinity;

    this.playerIds.forEach((id, index) => {
      for (const card of this.hands[id]) {
        if (card.suit === this.trumpSuit) {
          const value = RANK_VALUE[card.rank];
          if (value < bestValue) {
            bestValue = value;
            bestIndex = index;
          }
        }
      }
    });

    return bestIndex;
  }

  get attackerId() {
    return this.playerIds[this.attackerIndex];
  }

  get defenderId() {
    return this.playerIds[this.defenderIndex];
  }

  startRound() {
    this.table = [];
    this.phase = 'attack';
    this.roundPassed = false;
    this.defenderIndex = (this.attackerIndex + 1) % this.playerIds.length;
    this.defenderHandSizeAtRoundStart = this.hands[this.defenderId].length;
    this.lastAction = null;
  }

  canBeat(attackCard, defendCard) {
    if (defendCard.suit === attackCard.suit) {
      return RANK_VALUE[defendCard.rank] > RANK_VALUE[attackCard.rank];
    }
    if (defendCard.suit === this.trumpSuit && attackCard.suit !== this.trumpSuit) {
      return true;
    }
    if (defendCard.suit === this.trumpSuit && attackCard.suit === this.trumpSuit) {
      return RANK_VALUE[defendCard.rank] > RANK_VALUE[attackCard.rank];
    }
    return false;
  }

  getUnbeatenCards() {
    return this.table.filter(pair => !pair.defend);
  }

  getTableRanks() {
    const ranks = new Set();
    for (const pair of this.table) {
      ranks.add(pair.attack.rank);
      if (pair.defend) ranks.add(pair.defend.rank);
    }
    return ranks;
  }

  maxTableSize() {
    return Math.min(this.defenderHandSizeAtRoundStart, 6);
  }

  attack(playerId, cardId) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра окончена' };
    if (this.phase === 'throw') {
      if (playerId === this.defenderId) return { ok: false, error: 'Защитник не подкидывает' };
    } else if (playerId !== this.attackerId) {
      return { ok: false, error: 'Не ваш ход' };
    }
    if (!['attack', 'throw'].includes(this.phase)) return { ok: false, error: 'Сейчас нельзя атаковать' };

    const hand = this.hands[playerId];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { ok: false, error: 'Карты нет в руке' };

    const card = hand[cardIndex];

    if (this.phase === 'attack' && this.table.length === 0) {
      // First attack - any card
    } else if (this.phase === 'attack' && this.table.length > 0) {
      const firstRank = this.table[0].attack.rank;
      if (card.rank !== firstRank) {
        return { ok: false, error: 'Первый ход — карты одного достоинства' };
      }
    } else if (this.phase === 'throw') {
      const ranks = this.getTableRanks();
      if (!ranks.has(card.rank)) {
        return { ok: false, error: 'Можно подкидывать только совпадающие достоинства' };
      }
      if (this.getUnbeatenCards().length > 0) {
        return { ok: false, error: 'Сначала защитник должен отбить карты' };
      }
    }

    if (this.table.length >= this.maxTableSize()) {
      return { ok: false, error: 'Стол полон' };
    }

    hand.splice(cardIndex, 1);
    this.table.push({ attack: card, defend: null });
    this.phase = 'defend';

    this.lastAction = { type: 'attack', playerId, card };
    this.checkGameEnd();
    return { ok: true };
  }

  defend(playerId, cardId, attackIndex) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра окончена' };
    if (playerId !== this.defenderId) return { ok: false, error: 'Вы не защищаетесь' };
    if (this.phase !== 'defend') return { ok: false, error: 'Сейчас не фаза защиты' };

    const unbeaten = this.getUnbeatenCards();
    if (unbeaten.length === 0) return { ok: false, error: 'Нет карт для отбивания' };

    let targetPair;
    if (attackIndex !== undefined && attackIndex !== null) {
      targetPair = this.table[attackIndex];
      if (!targetPair || targetPair.defend) {
        return { ok: false, error: 'Неверная карта на столе' };
      }
    } else {
      targetPair = unbeaten[0];
    }

    const hand = this.hands[playerId];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { ok: false, error: 'Карты нет в руке' };

    const card = hand[cardIndex];
    if (!this.canBeat(targetPair.attack, card)) {
      return { ok: false, error: 'Эта карта не бьёт' };
    }

    hand.splice(cardIndex, 1);
    targetPair.defend = card;
    this.lastAction = { type: 'defend', playerId, card };

    if (this.getUnbeatenCards().length === 0) {
      this.phase = 'throw';
    }

    this.checkGameEnd();
    return { ok: true };
  }

  translate(playerId, cardId) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра окончена' };
    if (this.gameMode !== 'perevodnoy') return { ok: false, error: 'Перевод недоступен' };
    if (playerId !== this.defenderId) return { ok: false, error: 'Только защитник может переводить' };
    if (this.phase !== 'defend') return { ok: false, error: 'Сейчас нельзя переводить' };
    if (this.playerIds.length < 3) return { ok: false, error: 'Переводной режим от 3 игроков' };

    const ranks = this.getTableRanks();
    if (ranks.size === 0) return { ok: false, error: 'Стол пуст' };

    const hand = this.hands[playerId];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { ok: false, error: 'Карты нет в руке' };

    const card = hand[cardIndex];
    if (!ranks.has(card.rank)) {
      return { ok: false, error: 'Нужна карта того же достоинства, что на столе' };
    }

    if (this.table.length >= this.maxTableSize()) {
      return { ok: false, error: 'Стол полон' };
    }

    const n = this.playerIds.length;
    const nextDef = (this.defenderIndex + 1) % n;
    if (nextDef === this.attackerIndex) {
      return { ok: false, error: 'Некому переводить' };
    }

    hand.splice(cardIndex, 1);
    this.table.push({ attack: card, defend: null });
    this.defenderIndex = nextDef;
    this.defenderHandSizeAtRoundStart = this.hands[this.defenderId].length;

    this.lastAction = { type: 'translate', playerId, card };
    this.phase = 'defend';
    this.checkGameEnd();
    return { ok: true };
  }

  take(playerId) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра окончена' };
    if (playerId !== this.defenderId) return { ok: false, error: 'Только защитник может взять' };
    if (this.table.length === 0) return { ok: false, error: 'Стол пуст' };

    const hand = this.hands[playerId];
    for (const pair of this.table) {
      hand.push(pair.attack);
      if (pair.defend) hand.push(pair.defend);
    }

    this.lastAction = { type: 'take', playerId };
    this.endRound(false);
    return { ok: true };
  }

  pass(playerId) {
    if (this.status !== 'playing') return { ok: false, error: 'Игра окончена' };
    if (playerId !== this.attackerId) return { ok: false, error: 'Только атакующий может сказать «Бито»' };
    if (this.phase !== 'throw') return { ok: false, error: 'Сейчас нельзя пасовать' };
    if (this.getUnbeatenCards().length > 0) {
      return { ok: false, error: 'Есть неотбитые карты' };
    }
    if (this.table.length === 0) {
      return { ok: false, error: 'Стол пуст' };
    }

    this.lastAction = { type: 'pass', playerId };
    this.endRound(true);
    return { ok: true };
  }

  endRound(defended) {
    if (defended) {
      this.attackerIndex = (this.attackerIndex + 1) % this.playerIds.length;
    }

    this.drawCards();
    this.checkGameEnd();

    if (this.status === 'playing') {
      this.startRound();
    }
  }

  drawCards() {
    const n = this.playerIds.length;
    for (let i = 0; i < n; i++) {
      const id = this.playerIds[(this.attackerIndex + i) % n];
      while (this.hands[id].length < 6 && this.deck.length > 0) {
        this.hands[id].push(this.deck.shift());
      }
    }
  }

  checkGameEnd() {
    const playersWithCards = this.playerIds.filter(id => this.hands[id].length > 0);
    if (this.deck.length === 0 && playersWithCards.length <= 1) {
      this.status = 'finished';
      if (playersWithCards.length === 0) {
        this.winner = null;
        this.fool = null;
      } else if (playersWithCards.length === 1) {
        this.fool = playersWithCards[0];
        this.winner = this.playerIds.find(id => id !== this.fool);
      }
    }
  }

  getStateForPlayer(playerId) {
    const opponents = this.playerIds
      .filter(id => id !== playerId)
      .map(id => {
        const entry = { id, cardCount: (this.hands[id] || []).length };
        if (this.allowCheating) {
          entry.hand = [...(this.hands[id] || [])];
        }
        return entry;
      });

    const legacyOpponent = opponents[0];
    const tableRanks = this.getTableRanks();
    const canTranslate = this.gameMode === 'perevodnoy'
      && this.phase === 'defend'
      && playerId === this.defenderId
      && this.playerIds.length >= 3
      && (this.hands[playerId] || []).some(c => tableRanks.has(c.rank));

    return {
      status: this.status,
      trump: this.trump,
      trumpSuit: this.trumpSuit,
      deckCount: this.deck.length,
      hand: this.hands[playerId] || [],
      opponents,
      opponentCardCount: legacyOpponent?.cardCount ?? 0,
      playerCount: this.playerIds.length,
      table: this.table,
      phase: this.phase,
      attackerId: this.attackerId,
      defenderId: this.defenderId,
      isAttacker: playerId === this.attackerId,
      isDefender: playerId === this.defenderId,
      canThrow: this.phase === 'throw' && playerId !== this.defenderId,
      canTranslate,
      isYourTurn: this.isPlayerTurn(playerId),
      winner: this.winner,
      fool: this.fool,
      gameMode: this.gameMode,
      deckSize: this.deckSize,
      allowCheating: this.allowCheating,
      lastAction: this.lastAction,
      maxTableSize: this.maxTableSize(),
    };
  }

  isPlayerTurn(playerId) {
    if (this.status !== 'playing') return false;
    if (this.phase === 'attack') {
      return playerId === this.attackerId;
    }
    if (this.phase === 'throw') {
      return playerId !== this.defenderId;
    }
    if (this.phase === 'defend') {
      return playerId === this.defenderId;
    }
    return false;
  }
}