import { SUITS } from './types.js';

const DECK_RANKS = {
  24: ['9', '10', 'J', 'Q', 'K', 'A'],
  36: ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  52: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
};

export function createDeck(deckSize = 36) {
  const size = DECK_RANKS[deckSize] ? deckSize : 36;
  const ranks = DECK_RANKS[size];
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push({ id: `card-${id++}`, suit, rank });
    }
  }
  return deck;
}

export function shuffle(deck) {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}