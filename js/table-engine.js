/**
 * table-engine.js — Orchestration d'une main complète de Texas Hold'em
 * Gère : distribution, blinds, tours de mise, side pots, showdown.
 */

class TableEngine {
  /**
   * seats: [{ id, name, isHuman, stack, aiInstance|null }]
   * smallBlind, bigBlind: montants
   */
  constructor(seats, smallBlind, bigBlind) {
    this.seats = seats; // ordre fixe des sièges
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.dealerIndex = 0;
    this.handNumber = 0;
  }

  get activeSeats() {
    return this.seats.filter(s => s.stack > 0);
  }

  positionsFor(n) {
    return n === 2 ? CONFIG.POSITIONS_HEADS_UP : CONFIG.POSITIONS_6MAX;
  }

  /**
   * Démarre une nouvelle main. Retourne l'état initial de la main.
   */
  startHand() {
    this.handNumber++;
    const active = this.activeSeats;
    if (active.length < 2) return null;

    const deck = PokerEngine.shuffleDeck(PokerEngine.createDeck());
    let deckIdx = 0;

    const n = active.length;
    const positions = this.positionsFor(n);

    // Assignation des positions relatives au bouton
    const order = [];
    for (let i = 0; i < n; i++) {
      order.push(active[(this.dealerIndex + i) % n]);
    }
    order.forEach((seat, i) => { seat.position = positions[i]; });

    // Distribution des cartes (2 par joueur)
    const players = {};
    for (const seat of order) {
      const holeCards = [deck[deckIdx++], deck[deckIdx++]];
      players[seat.id] = {
        id: seat.id, name: seat.name, isHuman: seat.isHuman,
        aiInstance: seat.aiInstance,
        holeCards, position: seat.position,
        stack: seat.stack, folded: false, allIn: false,
        currentBet: 0, totalContributed: 0
      };
    }

    const hand = {
      handNumber: this.handNumber,
      deck, deckIdx,
      order: order.map(s => s.id),
      players,
      communityCards: [],
      pot: 0,
      street: 'preflop',
      actionHistory: [],
      currentBetLevel: 0,
      lastRaiseSize: this.bigBlind
    };

    // Poste des blinds
    const sbSeat = n === 2 ? order[0] : order[n - 2];
    const bbSeat = n === 2 ? order[1] : order[n - 1];
    this._postBlind(hand, sbSeat.id, this.smallBlind, 'small_blind');
    this._postBlind(hand, bbSeat.id, this.bigBlind, 'big_blind');
    hand.currentBetLevel = this.bigBlind;

    // Ordre d'action préflop : après la BB (ou UTG en 6-max)
    const bbOrderIdx = hand.order.indexOf(bbSeat.id);
    hand.actingOrder = [];
    for (let i = 1; i <= n; i++) {
      hand.actingOrder.push(hand.order[(bbOrderIdx + i) % n]);
    }
    hand.actingOrder.pop(); // retire la BB elle-même du bout (elle agira en dernier via la queue naturelle)
    hand.actingOrder.push(bbSeat.id);

    hand.actingQueue = [...hand.actingOrder];
    hand.playersToAct = new Set(Object.keys(hand.players).filter(id => !hand.players[id].folded));

    return hand;
  }

  _postBlind(hand, seatId, amount, label) {
    const p = hand.players[seatId];
    const actual = Math.min(amount, p.stack);
    p.stack -= actual;
    p.currentBet = actual;
    p.totalContributed = actual;
    hand.pot += actual;
    if (p.stack === 0) p.allIn = true;
    hand.actionHistory.push({ playerId: seatId, action: label, amount: actual, street: 'preflop' });
  }

  /**
   * Applique une action d'un joueur.
   * action: { action: 'fold'|'check'|'call'|'raise'|'allin', amount }
   */
  applyAction(hand, playerId, action) {
    const p = hand.players[playerId];
    if (!p || p.folded || p.allIn) return hand;

    const toCall = hand.currentBetLevel - p.currentBet;

    switch (action.action) {
      case 'fold':
        p.folded = true;
        break;
      case 'check':
        break;
      case 'call': {
        const amt = Math.min(toCall, p.stack);
        p.stack -= amt;
        p.currentBet += amt;
        p.totalContributed += amt;
        hand.pot += amt;
        if (p.stack === 0) p.allIn = true;
        break;
      }
      case 'raise': {
        let raiseTo = action.amount;
        if (!Number.isFinite(raiseTo) || raiseTo <= p.currentBet) {
          // Sécurité : si le montant est invalide, retombe sur un call/all-in
          raiseTo = Math.min(hand.currentBetLevel + hand.lastRaiseSize, p.currentBet + p.stack);
        }
        const amt = Math.min(raiseTo - p.currentBet, p.stack);
        p.stack -= amt;
        p.currentBet += amt;
        p.totalContributed += amt;
        hand.pot += amt;
        hand.lastRaiseSize = Math.max(hand.lastRaiseSize, p.currentBet - hand.currentBetLevel);
        hand.currentBetLevel = p.currentBet;
        if (p.stack === 0) p.allIn = true;
        // Rouvre l'action pour tous les autres joueurs actifs
        this._reopenAction(hand, playerId);
        break;
      }
      case 'allin': {
        const amt = p.stack;
        p.stack = 0;
        p.currentBet += amt;
        p.totalContributed += amt;
        hand.pot += amt;
        p.allIn = true;
        if (p.currentBet > hand.currentBetLevel) {
          hand.lastRaiseSize = Math.max(hand.lastRaiseSize, p.currentBet - hand.currentBetLevel);
          hand.currentBetLevel = p.currentBet;
          this._reopenAction(hand, playerId);
        }
        break;
      }
    }

    hand.actionHistory.push({ playerId, action: action.action, amount: action.amount || 0, street: hand.street });
    hand.playersToAct.delete(playerId);
    return hand;
  }

  _reopenAction(hand, raiserId) {
    const others = Object.keys(hand.players).filter(id =>
      id !== raiserId && !hand.players[id].folded && !hand.players[id].allIn
    );
    hand.playersToAct = new Set(others);
  }

  getRemainingPlayers(hand) {
    return Object.values(hand.players).filter(p => !p.folded);
  }

  isBettingRoundOver(hand) {
    const remaining = this.getRemainingPlayers(hand);
    if (remaining.length <= 1) return true;
    const nonAllIn = remaining.filter(p => !p.allIn);
    if (nonAllIn.length <= 1) return true; // tout le monde est all-in sauf 0-1
    return hand.playersToAct.size === 0;
  }

  /**
   * Passe à la street suivante, révèle les cartes communes nécessaires.
   */
  advanceStreet(hand) {
    for (const p of Object.values(hand.players)) p.currentBet = 0;
    hand.currentBetLevel = 0;
    hand.lastRaiseSize = this.bigBlind;

    const remaining = this.getRemainingPlayers(hand).filter(p => !p.allIn);

    if (hand.street === 'preflop') {
      hand.communityCards.push(hand.deck[hand.deckIdx++], hand.deck[hand.deckIdx++], hand.deck[hand.deckIdx++]);
      hand.street = 'flop';
    } else if (hand.street === 'flop') {
      hand.communityCards.push(hand.deck[hand.deckIdx++]);
      hand.street = 'turn';
    } else if (hand.street === 'turn') {
      hand.communityCards.push(hand.deck[hand.deckIdx++]);
      hand.street = 'river';
    } else if (hand.street === 'river') {
      hand.street = 'showdown';
      return hand;
    }

    // Ordre d'action post-flop : premier joueur actif après le bouton
    const activeIds = hand.order.filter(id => !hand.players[id].folded && !hand.players[id].allIn);
    hand.actingQueue = [...activeIds];
    hand.playersToAct = new Set(activeIds);
    return hand;
  }

  /**
   * Résout la main : détermine le(s) gagnant(s), gère les side pots simplifiés (répartition égale
   * proportionnelle aux contributions en cas d'all-in multiples).
   */
  resolveHand(hand) {
    const remaining = this.getRemainingPlayers(hand);

    if (remaining.length === 1) {
      const winner = remaining[0];
      winner.stack += hand.pot;
      return { winners: [winner.id], amountWon: { [winner.id]: hand.pot }, results: {}, wentToShowdown: false };
    }

    // Side pots : construits à partir de TOUS les paliers de contribution (y compris joueurs couchés),
    // car leurs jetons alimentent les pots jusqu'à leur niveau de contribution.
    const allContributors = Object.values(hand.players).map(p => ({ id: p.id, contributed: p.totalContributed, folded: p.folded }));

    let pots = [];
    let prevLevel = 0;
    const levels = [...new Set(allContributors.map(c => c.contributed))].filter(l => l > 0).sort((a, b) => a - b);

    for (const level of levels) {
      const layer = level - prevLevel;
      // Joueurs (non couchés) encore éligibles à ce palier de pot
      const eligible = remaining.filter(p => p.totalContributed >= level);
      // Tous les joueurs (couchés ou non) ayant contribué au moins jusqu'à ce palier alimentent la couche
      const payers = allContributors.filter(c => c.contributed >= level);
      const amount = layer * payers.length;
      if (amount > 0 && eligible.length > 0) {
        pots.push({ amount, eligibleIds: eligible.map(e => e.id) });
      }
      prevLevel = level;
    }

    const results = {};
    const amountWon = {};
    const allWinners = new Set();

    for (const pot of pots) {
      const eligiblePlayers = remaining.filter(p => pot.eligibleIds.includes(p.id));
      const { winners, results: potResults } = PokerEngine.determineWinners(
        eligiblePlayers.map(p => ({ id: p.id, holeCards: p.holeCards })),
        hand.communityCards
      );
      Object.assign(results, potResults);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        allWinners.add(w);
        const extra = remainder > 0 ? 1 : 0;
        amountWon[w] = (amountWon[w] || 0) + share + extra;
        if (remainder > 0) remainder--;
        hand.players[w].stack += share + extra;
      }
    }

    return { winners: [...allWinners], amountWon, results, wentToShowdown: true };
  }

  rotateDealer() {
    const active = this.activeSeats;
    if (active.length === 0) return;
    const currentDealerId = this.seats[this.dealerIndex]?.id;
    let nextIdx = (this.dealerIndex + 1) % this.seats.length;
    // saute les joueurs éliminés
    let attempts = 0;
    while (this.seats[nextIdx].stack <= 0 && attempts < this.seats.length) {
      nextIdx = (nextIdx + 1) % this.seats.length;
      attempts++;
    }
    this.dealerIndex = nextIdx;
  }
}

if (typeof module !== 'undefined') module.exports = TableEngine;
