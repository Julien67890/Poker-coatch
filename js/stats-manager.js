/**
 * stats-manager.js — Persistance IndexedDB : profil, sessions, mains, stats cumulées, paramètres.
 */

const DB_NAME = 'poker-coach-db';
const DB_VERSION = 1;

class StatsManager {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          store.createIndex('startTime', 'startTime', { unique: false });
        }
        if (!db.objectStoreNames.contains('hands')) {
          const store = db.createObjectStore('hands', { keyPath: 'handId', autoIncrement: true });
          store.createIndex('sessionId', 'sessionId', { unique: false });
        }
        if (!db.objectStoreNames.contains('cumulativeStats')) {
          db.createObjectStore('cumulativeStats', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  _tx(storeName, mode = 'readonly') {
    return this.db.transaction(storeName, mode).objectStore(storeName);
  }

  // ---------- Profil ----------
  async saveProfile(profile) {
    return this._put('profile', { id: 'main', ...profile });
  }
  async getProfile() {
    return this._get('profile', 'main');
  }

  // ---------- Paramètres ----------
  async saveSettings(settings) {
    return this._put('settings', { id: 'main', ...settings });
  }
  async getSettings() {
    const s = await this._get('settings', 'main');
    return s || { soundEnabled: true, timerSeconds: 30, cardBack: 'blue', theme: 'dark' };
  }

  // ---------- Sessions ----------
  async createSession(session) {
    return this._put('sessions', session);
  }
  async updateSession(session) {
    return this._put('sessions', session);
  }
  async getSession(sessionId) {
    return this._get('sessions', sessionId);
  }
  async getAllSessions() {
    return this._getAll('sessions');
  }
  async getRecentSessions(limit = 20) {
    const all = await this._getAll('sessions');
    return all.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, limit);
  }

  // ---------- Mains ----------
  async saveHand(handRecord) {
    return this._put('hands', handRecord);
  }
  async getHandsForSession(sessionId) {
    return new Promise((resolve, reject) => {
      const store = this._tx('hands');
      const index = store.index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- Stats cumulées ----------
  async getCumulativeStats() {
    const stats = await this._get('cumulativeStats', 'main');
    return stats || this._emptyCumulativeStats();
  }

  _emptyCumulativeStats() {
    return {
      id: 'main',
      totalHandsPlayed: 0,
      roiByDifficulty: {},
      handsByPosition: {},
      winsByPosition: {},
      foldFrequencyByAction: { fold: 0, call: 0, raise: 0, allin: 0, total: 0 },
      handsByStartingTier: {},
      winsByStartingTier: {},
      personalRecords: { biggestWin: 0, biggestLoss: 0, bestWinRate: 0, longestWinStreak: 0 },
      difficultyLevelsBeaten: []
    };
  }

  async updateCumulativeStats(updater) {
    const current = await this.getCumulativeStats();
    const updated = updater(current);
    return this._put('cumulativeStats', updated);
  }

  // ---------- Helpers génériques ----------
  _put(storeName, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx(storeName, 'readwrite').put(value);
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }
  _get(storeName, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = this._tx(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Calcule les statistiques agrégées d'une session à partir de son historique de mains.
   */
  computeSessionStats(session, hands) {
    const totalHands = hands.length;
    let wins = 0, losses = 0;
    let profitLoss = session.finalBankroll != null ? session.finalBankroll - session.startBankroll : 0;
    const positionStats = {};
    const actionCounts = { fold: 0, call: 0, raise: 0, allin: 0, check: 0 };
    const tierStats = {};

    for (const h of hands) {
      const isWin = h.playerWon;
      if (isWin) wins++; else losses++;

      const pos = h.playerPosition;
      if (pos) {
        positionStats[pos] = positionStats[pos] || { hands: 0, wins: 0, folds: 0, raises: 0 };
        positionStats[pos].hands++;
        if (isWin) positionStats[pos].wins++;
      }

      if (h.playerActions) {
        for (const a of h.playerActions) {
          actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
          if (pos) {
            if (a.action === 'fold') positionStats[pos].folds++;
            if (a.action === 'raise') positionStats[pos].raises++;
          }
        }
      }

      if (h.startingTier) {
        tierStats[h.startingTier] = tierStats[h.startingTier] || { played: 0, won: 0 };
        tierStats[h.startingTier].played++;
        if (isWin) tierStats[h.startingTier].won++;
      }
    }

    const roi = session.startBankroll > 0
      ? Math.round(((profitLoss) / session.startBankroll) * 1000) / 10
      : 0;

    const durationMinutes = session.endTime
      ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 60000)
      : 0;

    const bb100 = totalHands > 0 && session.bigBlind > 0
      ? Math.round((profitLoss / session.bigBlind / totalHands) * 100 * 10) / 10
      : 0;

    return {
      totalHands, wins, losses, roi, profitLoss, durationMinutes, bb100,
      positionStats, actionCounts, tierStats
    };
  }
}

const statsManager = new StatsManager();
if (typeof module !== 'undefined') module.exports = { StatsManager, statsManager };
