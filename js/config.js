/**
 * config.js — Constantes globales et définitions de difficulté
 */

const DIFFICULTY_LEVELS = {
  1: {
    id: 1, name: 'Débutant',
    foldFreq: 0.70, raiseFreq: 0.10, bluffRate: 0.0,
    playableTiers: ['premium'],
    sizingStyle: 'passive',
    description: 'Ne joue que des mains premium (AA, KK, QQ, AK). Ne bluffe jamais.'
  },
  2: {
    id: 2, name: 'Intermédiaire',
    foldFreq: 0.50, raiseFreq: 0.25, bluffRate: 0.05,
    playableTiers: ['premium', 'strong'],
    sizingStyle: 'standard',
    description: 'Joue des ranges adaptées à la position.'
  },
  3: {
    id: 3, name: 'Avancé',
    foldFreq: 0.35, raiseFreq: 0.40, bluffRate: 0.15,
    playableTiers: ['premium', 'strong', 'medium'],
    sizingStyle: 'varied',
    description: 'Agressif, lit les tendances du joueur.'
  },
  4: {
    id: 4, name: 'Expert',
    foldFreq: 0.25, raiseFreq: 0.50, bluffRate: 0.25,
    playableTiers: ['premium', 'strong', 'medium'],
    sizingStyle: 'sophisticated',
    description: 'Planification multi-street, ranges équilibrées.'
  },
  5: {
    id: 5, name: 'Pro',
    foldFreq: 0.15, raiseFreq: 0.60, bluffRate: 0.30,
    playableTiers: ['premium', 'strong', 'medium', 'weak'],
    sizingStyle: 'optimal',
    description: 'Proche du GTO, exploite les faiblesses du joueur.'
  }
};

const POSITIONS_HEADS_UP = ['BTN/SB', 'BB'];
const POSITIONS_6MAX = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const DEFAULT_BANKROLL = 1000;
const MIN_BANKROLL = 500;
const MAX_BANKROLL = 10000;

const HAND_RANKINGS_INFO = [
  { rank: 10, name: 'Quinte flush royale', desc: 'A-K-Q-J-10, même couleur' },
  { rank: 9, name: 'Quinte flush', desc: '5 cartes consécutives, même couleur' },
  { rank: 8, name: 'Carré', desc: '4 cartes de même rang' },
  { rank: 7, name: 'Full', desc: 'Brelan + paire' },
  { rank: 6, name: 'Couleur', desc: '5 cartes de même enseigne' },
  { rank: 5, name: 'Quinte', desc: '5 cartes consécutives, enseignes mixtes' },
  { rank: 4, name: 'Brelan', desc: '3 cartes de même rang' },
  { rank: 3, name: 'Double paire', desc: '2 paires différentes' },
  { rank: 2, name: 'Paire', desc: '2 cartes de même rang' },
  { rank: 1, name: 'Carte haute', desc: 'Aucune combinaison' }
];

function bigBlindForBankroll(bankroll) {
  // Blinds proportionnelles au stack de départ (environ 1% du stack = BB)
  const bb = Math.max(2, Math.round((bankroll * 0.01) / 2) * 2);
  return bb;
}

const CONFIG = {
  DIFFICULTY_LEVELS, POSITIONS_HEADS_UP, POSITIONS_6MAX,
  DEFAULT_BANKROLL, MIN_BANKROLL, MAX_BANKROLL,
  HAND_RANKINGS_INFO, bigBlindForBankroll,
  DECISION_TIMER_SECONDS: 30,
  MAX_HANDS_PER_SESSION: 100
};

if (typeof module !== 'undefined') module.exports = CONFIG;
