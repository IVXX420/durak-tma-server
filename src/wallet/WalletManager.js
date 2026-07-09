const START_BALANCE = 1000;

export class WalletManager {
  constructor() {
    this.balances = new Map();
  }

  getBalance(playerId) {
    if (!this.balances.has(playerId)) {
      this.balances.set(playerId, START_BALANCE);
    }
    return this.balances.get(playerId);
  }

  canAfford(playerId, amount) {
    return amount <= 0 || this.getBalance(playerId) >= amount;
  }

  deduct(playerId, amount) {
    if (amount <= 0) return { ok: true };
    const balance = this.getBalance(playerId);
    if (balance < amount) return { ok: false, error: 'Недостаточно монет' };
    this.balances.set(playerId, balance - amount);
    return { ok: true };
  }

  add(playerId, amount) {
    if (amount <= 0) return;
    this.balances.set(playerId, this.getBalance(playerId) + amount);
  }
}