/**
 * ai-opponent.js — Logique de décision des adversaires IA (5 niveaux)
 */

class AIOpponent {
  constructor(id, name, difficultyLevel) {
    this.id = id;
    this.name = name;
    this.difficulty = difficultyLevel;
    this.profile = CONFIG.DIFFICULTY_LEVELS[difficultyLevel];
    // Modélisation comportementale (mise à jour au fil des mains)
    this.stats = {
      handsPlayed: 0,
      foldToRaiseCount: 0,
      foldToRaiseOpportunities: 0,
      bluffsAttempted: 0,
      raisesByPosition: {},
      handsByPosition: {}
    };
  }

  /**
   * Décide de l'action à prendre.
   * context: { holeCards, communityCards, potSize, amountToCall, stack, position,
   *            minRaise, street, playerAggressionFactor }
   * Retourne { action: 'fold'|'check'|'call'|'raise'|'allin', amount }
   */
  decide(context) {
    const { holeCards, communityCards, potSize, amountToCall, stack, position, minRaise, street } = context;

    const startTier = PokerEngine.classifyStartingHand(holeCards).tier;
    const canCheck = amountToCall === 0;

    // Force de main courante (préflop = tier de départ, postflop = équité estimée simplifiée)
    let strength;
    if (street === 'preflop') {
      strength = this._tierToStrength(startTier);
    } else {
      const evalResult = PokerEngine.evaluateHand([...holeCards, ...communityCards]);
      strength = this._handRankToStrength(evalResult.rankIndex);
    }

    // Ajustement positionnel : plus large en position tardive
    const positionBonus = this._positionBonus(position, context.tableSize);
    strength = Math.min(1, strength + positionBonus);

    // Décision de bluff (indépendante de la force réelle)
    const isBluffing = Math.random() < this.profile.bluffRate && strength < 0.4 && street !== 'preflop';
    if (isBluffing) {
      this.stats.bluffsAttempted++;
      strength = Math.max(strength, 0.65); // se comporte comme une main forte
    }

    // Seuils de décision ajustés par le profil de difficulté
    const foldThreshold = this.profile.foldFreq * (1 - strength);
    const raiseThreshold = 1 - this.profile.raiseFreq * strength;

    const roll = Math.random();

    // Pas de mise à suivre : check ou bet
    if (canCheck) {
      if (roll < this.profile.raiseFreq * strength + (isBluffing ? 0.3 : 0)) {
        return this._buildRaise(context, strength);
      }
      return { action: 'check', amount: 0 };
    }

    // Mise à suivre : fold / call / raise
    if (strength < 0.25 * (1 + this.profile.foldFreq) && roll < foldThreshold && !isBluffing) {
      this.stats.foldToRaiseOpportunities++;
      if (context.playerRaised) this.stats.foldToRaiseCount++;
      return { action: 'fold', amount: 0 };
    }

    if (roll > raiseThreshold || isBluffing) {
      if (stack <= amountToCall * 1.5 && strength > 0.7) {
        return { action: 'allin', amount: stack };
      }
      return this._buildRaise(context, strength);
    }

    if (amountToCall >= stack) {
      return strength > 0.3 ? { action: 'allin', amount: stack } : { action: 'fold', amount: 0 };
    }

    return { action: 'call', amount: amountToCall };
  }

  _tierToStrength(tier) {
    const map = { premium: 0.9, strong: 0.7, medium: 0.5, weak: 0.25 };
    const base = map[tier] ?? 0.25;
    // Filtre selon les tiers jouables du niveau (les niveaux faibles ignorent les mains hors-range)
    if (!this.profile.playableTiers.includes(tier)) {
      return base * 0.3;
    }
    return base;
  }

  _handRankToStrength(rankIndex) {
    // rankIndex 0 (carte haute) à 9 (quinte flush royale)
    return Math.min(1, 0.15 + rankIndex * 0.1);
  }

  _positionBonus(position, tableSize) {
    if (!position) return 0;
    const latePositions = tableSize === 2 ? ['BTN/SB'] : ['CO', 'BTN'];
    const earlyPositions = tableSize === 2 ? [] : ['UTG'];
    if (latePositions.includes(position)) return 0.08;
    if (earlyPositions.includes(position)) return -0.06;
    return 0;
  }

  _buildRaise(context, strength) {
    const { potSize, minRaise, stack, amountToCall } = context;
    let sizeMultiplier;
    switch (this.profile.sizingStyle) {
      case 'passive': sizeMultiplier = 2.2; break;
      case 'standard': sizeMultiplier = 2.5 + Math.random() * 0.5; break;
      case 'varied': sizeMultiplier = 1.8 + Math.random() * 1.8; break;
      case 'sophisticated': sizeMultiplier = strength > 0.6 ? (1.5 + Math.random()) : (2.5 + Math.random() * 1.5); break;
      case 'optimal': sizeMultiplier = 0.5 + Math.random() * 1.3 + strength; break;
      default: sizeMultiplier = 2.5;
    }
    let amount = Math.round(Math.max(minRaise, (amountToCall || potSize * 0.3) * sizeMultiplier));
    amount = Math.min(amount, stack);
    if (amount >= stack) return { action: 'allin', amount: stack };
    return { action: 'raise', amount };
  }

  recordHandPlayed(position) {
    this.stats.handsPlayed++;
    this.stats.handsByPosition[position] = (this.stats.handsByPosition[position] || 0) + 1;
  }

  getFoldToRaiseFrequency() {
    if (this.stats.foldToRaiseOpportunities === 0) return null;
    return Math.round((this.stats.foldToRaiseCount / this.stats.foldToRaiseOpportunities) * 100);
  }

  getTendencySummary() {
    const foldFreq = this.getFoldToRaiseFrequency();
    if (foldFreq === null) return `${this.name} : pas encore assez de données.`;
    return `${this.name} se couche à ${foldFreq}% face aux relances.`;
  }
}

if (typeof module !== 'undefined') module.exports = AIOpponent;
