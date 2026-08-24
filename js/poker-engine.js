/**
 * poker-engine.js
 * Moteur de jeu Texas Hold'em : cartes, deck, évaluation des mains,
 * comparaison de mains, calcul d'équité (Monte Carlo).
 */

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

const HAND_RANK_NAMES = [
  'Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte',
  'Couleur', 'Full', 'Carré', 'Quinte flush', 'Quinte flush royale'
];

function createCard(rank, suit) {
  return { rank, suit, id: rank + suit, value: RANK_VALUES[rank] };
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createCard(rank, suit));
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardToString(card) {
  return `${card.rank}${card.suit}`;
}

/**
 * Évalue la meilleure main de 5 cartes parmi un ensemble de 5 à 7 cartes.
 * Retourne { rankIndex, rankName, tiebreakers: [...], bestFive: [...] }
 * rankIndex : 0 (carte haute) à 9 (quinte flush royale)
 */
function evaluateHand(cards) {
  if (cards.length < 5) throw new Error('Il faut au moins 5 cartes pour évaluer une main');

  const combos = getCombinations(cards, 5);
  let best = null;

  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (!best || compareHandResults(result, best) > 0) {
      best = result;
    }
  }
  return best;
}

function getCombinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

function evaluateFiveCards(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Détection de quinte (gère l'As bas : A-2-3-4-5)
  let straightHigh = null;
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length >= 5) {
    for (let i = 0; i <= uniqueValues.length - 5; i++) {
      if (uniqueValues[i] - uniqueValues[i + 4] === 4) {
        straightHigh = uniqueValues[i];
        break;
      }
    }
  }
  // As bas : A,5,4,3,2
  if (straightHigh === null && [14, 5, 4, 3, 2].every(v => uniqueValues.includes(v))) {
    straightHigh = 5; // la quinte la plus basse, sommet = 5
  }

  // Groupement par rang (comptage)
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([value, count]) => ({ value: Number(value), count }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const countPattern = groups.map(g => g.count);

  // Quinte flush
  if (isFlush && straightHigh !== null) {
    const rankIdx = straightHigh === 14 && uniqueValues[0] === 14 && uniqueValues.includes(13) ? 9 : 8;
    return {
      rankIndex: straightHigh === 14 ? 9 : 8,
      rankName: straightHigh === 14 ? HAND_RANK_NAMES[9] : HAND_RANK_NAMES[8],
      tiebreakers: [straightHigh],
      bestFive: sorted
    };
  }

  // Carré
  if (countPattern[0] === 4) {
    const quadValue = groups[0].value;
    const kicker = groups.find(g => g.count === 1)?.value ?? groups[1].value;
    return { rankIndex: 7, rankName: HAND_RANK_NAMES[7], tiebreakers: [quadValue, kicker], bestFive: sorted };
  }

  // Full
  if (countPattern[0] === 3 && countPattern[1] === 2) {
    return { rankIndex: 6, rankName: HAND_RANK_NAMES[6], tiebreakers: [groups[0].value, groups[1].value], bestFive: sorted };
  }

  // Couleur
  if (isFlush) {
    return { rankIndex: 5, rankName: HAND_RANK_NAMES[5], tiebreakers: values, bestFive: sorted };
  }

  // Quinte
  if (straightHigh !== null) {
    return { rankIndex: 4, rankName: HAND_RANK_NAMES[4], tiebreakers: [straightHigh], bestFive: sorted };
  }

  // Brelan
  if (countPattern[0] === 3) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rankIndex: 3, rankName: HAND_RANK_NAMES[3], tiebreakers: [groups[0].value, ...kickers], bestFive: sorted };
  }

  // Double paire
  if (countPattern[0] === 2 && countPattern[1] === 2) {
    const pairValues = groups.filter(g => g.count === 2).map(g => g.value).sort((a, b) => b - a);
    const kicker = groups.find(g => g.count === 1).value;
    return { rankIndex: 2, rankName: HAND_RANK_NAMES[2], tiebreakers: [...pairValues, kicker], bestFive: sorted };
  }

  // Paire
  if (countPattern[0] === 2) {
    const kickers = groups.filter(g => g.count === 1).map(g => g.value).sort((a, b) => b - a);
    return { rankIndex: 1, rankName: HAND_RANK_NAMES[1], tiebreakers: [groups[0].value, ...kickers], bestFive: sorted };
  }

  // Carte haute
  return { rankIndex: 0, rankName: HAND_RANK_NAMES[0], tiebreakers: values, bestFive: sorted };
}

function compareHandResults(a, b) {
  if (a.rankIndex !== b.rankIndex) return a.rankIndex - b.rankIndex;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Détermine le(s) gagnant(s) parmi plusieurs joueurs actifs.
 * players: [{ id, holeCards }], communityCards: [...]
 * Retourne { winners: [ids], results: { id: evalResult } }
 */
function determineWinners(players, communityCards) {
  const results = {};
  for (const p of players) {
    results[p.id] = evaluateHand([...p.holeCards, ...communityCards]);
  }
  let bestResult = null;
  let winners = [];
  for (const p of players) {
    const r = results[p.id];
    if (!bestResult || compareHandResults(r, bestResult) > 0) {
      bestResult = r;
      winners = [p.id];
    } else if (compareHandResults(r, bestResult) === 0) {
      winners.push(p.id);
    }
  }
  return { winners, results };
}

/**
 * Estimation d'équité par simulation Monte Carlo.
 * holeCards: cartes du joueur, opponentsCount: nb d'adversaires actifs,
 * communityCards: cartes déjà révélées, usedCards: toutes les cartes déjà visibles (pour exclusion),
 * iterations: nb de simulations
 */
function estimateEquity(holeCards, opponentsCount, communityCards = [], usedCards = [], iterations = 500) {
  const excludedIds = new Set([...holeCards, ...communityCards, ...usedCards].map(c => c.id));
  const baseDeck = createDeck().filter(c => !excludedIds.has(c.id));

  let wins = 0;
  let ties = 0;
  const neededCommunity = 5 - communityCards.length;

  for (let i = 0; i < iterations; i++) {
    const deck = shuffleDeck(baseDeck);
    let idx = 0;
    const simCommunity = [...communityCards, ...deck.slice(idx, idx + neededCommunity)];
    idx += neededCommunity;

    const oppHands = [];
    for (let o = 0; o < opponentsCount; o++) {
      oppHands.push([deck[idx], deck[idx + 1]]);
      idx += 2;
    }

    const myResult = evaluateHand([...holeCards, ...simCommunity]);
    let bestOpp = null;
    for (const oh of oppHands) {
      const r = evaluateHand([...oh, ...simCommunity]);
      if (!bestOpp || compareHandResults(r, bestOpp) > 0) bestOpp = r;
    }

    const cmp = compareHandResults(myResult, bestOpp);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
  }

  return Math.round(((wins + ties * 0.5) / iterations) * 1000) / 10; // % avec 1 décimale
}

/**
 * Calcule les pot odds : rapport pot/mise, et le taux de victoire requis en %.
 */
function calculatePotOdds(potSize, amountToCall) {
  if (amountToCall <= 0) return { ratio: null, requiredEquity: 0, text: 'Aucune mise à suivre' };
  const ratio = potSize / amountToCall;
  const requiredEquity = Math.round((amountToCall / (potSize + amountToCall)) * 1000) / 10;
  return {
    ratio: Math.round(ratio * 10) / 10,
    requiredEquity,
    text: `${Math.round(ratio)}:1`
  };
}

// Classement des mains de départ (utilisé par l'IA et le coach pour évaluer la "force préflop")
function classifyStartingHand(cards) {
  const [a, b] = cards;
  const high = Math.max(a.value, b.value);
  const low = Math.min(a.value, b.value);
  const suited = a.suit === b.suit;
  const paired = a.value === b.value;
  const gap = high - low;

  if (paired) {
    if (high >= 13) return { tier: 'premium', label: `Paire de ${a.rank}` };
    if (high >= 9) return { tier: 'strong', label: `Paire de ${a.rank}` };
    return { tier: 'medium', label: `Paire de ${a.rank}` };
  }
  if (high === 14 && low >= 11) return { tier: 'premium', label: 'As haut' };
  if (high >= 13 && low >= 10 && suited) return { tier: 'strong', label: 'Broadway assortie' };
  if (high >= 13 && low >= 10) return { tier: 'medium', label: 'Broadway' };
  if (suited && gap <= 1 && low >= 8) return { tier: 'strong', label: 'Connecteur assorti haut' };
  if (suited && gap <= 2) return { tier: 'medium', label: 'Connecteur assorti' };
  if (high === 14) return { tier: 'medium', label: 'As faible' };
  if (gap <= 1 && low >= 6) return { tier: 'medium', label: 'Connecteur' };
  return { tier: 'weak', label: 'Main faible' };
}

const PokerEngine = {
  SUITS, RANKS, RANK_VALUES, HAND_RANK_NAMES,
  createCard, createDeck, shuffleDeck, cardToString,
  evaluateHand, compareHandResults, determineWinners,
  estimateEquity, calculatePotOdds, classifyStartingHand,
  getCombinations
};

if (typeof module !== 'undefined') module.exports = PokerEngine;
