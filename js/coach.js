/**
 * coach.js — Coach de poker : calculs (équité, pot odds) + génération de conseils textuels.
 * Fonctionne 100% localement, sans dépendance réseau, réponse instantanée.
 * (Une intégration WebLLM optionnelle peut être branchée via setLLMBackend()).
 */

class PokerCoach {
  constructor() {
    this.llmBackend = null; // optionnel : instance WebLLM si chargée
    this.responseCache = new Map();
  }

  setLLMBackend(backend) {
    this.llmBackend = backend;
  }

  /**
   * Construit une analyse complète de la situation courante.
   */
  analyzeSituation(context) {
    const { holeCards, communityCards, potSize, amountToCall, opponentsCount, position, street, opponentTendencies } = context;

    const equity = PokerEngine.estimateEquity(holeCards, opponentsCount, communityCards, [], 400);
    const potOdds = PokerEngine.calculatePotOdds(potSize, amountToCall);
    const startTier = street === 'preflop' ? PokerEngine.classifyStartingHand(holeCards) : null;

    let recommendation;
    if (street === 'preflop' && startTier) {
      // Préflop : on s'appuie sur le tier de la main de départ plutôt que sur l'équité brute
      // (l'équité Monte Carlo contre une main adverse aléatoire surestime les mains faibles,
      // car elle ne modélise pas la range réelle d'ouverture d'un adversaire).
      recommendation = this._preflopRecommendation(startTier.tier, amountToCall, potOdds, position);
    } else if (amountToCall === 0) {
      recommendation = equity >= 55 ? 'RELANCER' : 'CHECK';
    } else if (potOdds.requiredEquity !== null && equity >= potOdds.requiredEquity + 15) {
      recommendation = 'RELANCER';
    } else if (potOdds.requiredEquity !== null && equity >= potOdds.requiredEquity) {
      recommendation = 'SUIVRE';
    } else {
      recommendation = 'SE COUCHER';
    }

    return { equity, potOdds, startTier, recommendation };
  }

  /**
   * Recommandation préflop basée sur le tier de la main de départ (pédagogiquement plus fiable
   * que l'équité Monte Carlo brute, qui suppose une main adverse uniformément aléatoire).
   */
  _preflopRecommendation(tier, amountToCall, potOdds, position) {
    const latePosition = position && ['BTN', 'BTN/SB', 'CO'].includes(position);

    if (tier === 'premium') return 'RELANCER';
    if (tier === 'strong') {
      if (amountToCall === 0) return 'RELANCER';
      return potOdds.requiredEquity !== null && potOdds.requiredEquity <= 30 ? 'SUIVRE' : 'RELANCER';
    }
    if (tier === 'medium') {
      if (amountToCall === 0) return latePosition ? 'RELANCER' : 'CHECK';
      if (latePosition && potOdds.requiredEquity !== null && potOdds.requiredEquity <= 25) return 'SUIVRE';
      return 'SE COUCHER';
    }
    // weak
    if (amountToCall === 0) return 'CHECK';
    return 'SE COUCHER';
  }

  /**
   * Génère un conseil condensé (mode Interactif).
   */
  generateInteractiveTip(context) {
    const analysis = this.analyzeSituation(context);
    const { equity, potOdds, recommendation } = analysis;

    let justification;
    if (recommendation === 'RELANCER') {
      justification = context.position && ['BTN', 'BTN/SB', 'CO'].includes(context.position)
        ? 'Avantage d\'équité et position favorable'
        : 'Main forte, valeur à construire';
    } else if (recommendation === 'SUIVRE') {
      justification = `Ton équité (${equity}%) dépasse le seuil requis (${potOdds.requiredEquity}%)`;
    } else if (recommendation === 'CHECK') {
      justification = 'Pas de mise à payer, autant voir la carte suivante gratuitement';
    } else if (context.street === 'preflop' && analysis.startTier) {
      justification = `Main de départ trop faible (${analysis.startTier.label.toLowerCase()}) pour cette mise`;
    } else {
      justification = `Ton équité (${equity}%) est sous le seuil requis (${potOdds.requiredEquity}%)`;
    }

    let tendencyNote = '';
    if (context.opponentTendency) {
      tendencyNote = context.opponentTendency;
    }

    return {
      action: recommendation,
      equity,
      justification,
      potOddsText: potOdds.ratio ? `Besoin de ${potOdds.text}` : 'Aucune mise à suivre',
      tendencyNote
    };
  }

  /**
   * Génère une explication pédagogique complète AVANT décision (mode Apprentissage).
   */
  generatePreDecisionExplanation(context) {
    const { holeCards, position, street } = context;
    const analysis = this.analyzeSituation(context);
    const cardsStr = holeCards.map(PokerEngine.cardToString).join(' ');

    let text = `Tu es en ${position || 'position'} avec ${cardsStr}. `;

    if (street === 'preflop' && analysis.startTier) {
      const tierText = {
        premium: 'C\'est une main premium, parmi les meilleures possibles.',
        strong: 'C\'est une main forte, jouable dans la plupart des positions.',
        medium: 'C\'est une main moyenne : à jouer surtout en bonne position.',
        weak: 'C\'est une main faible : se coucher est souvent la meilleure option.'
      };
      text += tierText[analysis.startTier.tier] + ' ';
    }

    if (analysis.recommendation === 'RELANCER') {
      text += `Tu devrais relancer ici. Cette main gagne souvent et mérite de construire le pot.`;
    } else if (analysis.recommendation === 'SUIVRE') {
      text += `Suivre est justifié : ton équité (${analysis.equity}%) dépasse ce que le pot exige (${analysis.potOdds.requiredEquity}%).`;
    } else if (analysis.recommendation === 'CHECK') {
      text += `Tu peux checker gratuitement ici, pas besoin de t'engager davantage.`;
    } else if (street === 'preflop' && analysis.startTier) {
      text += `Se coucher est recommandé : cette main ne vaut pas la mise face à une main de départ aussi faible.`;
    } else {
      text += `Se coucher est recommandé : ton équité (${analysis.equity}%) est insuffisante face à la mise.`;
    }

    return { text, analysis };
  }

  /**
   * Génère le commentaire post-main (mode Apprentissage) en comparant la décision du joueur
   * à la recommandation du coach.
   */
  generatePostHandFeedback(playerAction, recommendedAction, handResult) {
    const matched = this._actionsMatch(playerAction, recommendedAction);
    let text;

    if (matched) {
      text = `Bon choix ! Tu as ${this._actionLabel(playerAction)}, ce qui correspondait à la meilleure ligne de jeu ici.`;
    } else {
      text = `Tu as ${this._actionLabel(playerAction)} au lieu de ${recommendedAction.toLowerCase()}. `;
      if (recommendedAction === 'RELANCER' && playerAction === 'call') {
        text += 'C\'est correct pour un débutant, mais relancer aurait construit le pot avec ta meilleure main. La prochaine fois, sois plus agressif en position.';
      } else if (recommendedAction === 'SE COUCHER') {
        text += 'Attention à ne pas payer avec une équité insuffisante — cela coûte des jetons sur le long terme.';
      } else {
        text += 'Garde en tête les pot odds et ton équité pour la prochaine décision similaire.';
      }
    }

    if (handResult) {
      text += handResult.won
        ? ` Tu as remporté ${handResult.amount} jetons sur ce coup.`
        : ` Tu as perdu ce coup, mais la décision compte plus que le résultat sur une seule main.`;
    }

    return text;
  }

  _actionsMatch(playerAction, recommendedAction) {
    const map = { fold: 'SE COUCHER', check: 'CHECK', call: 'SUIVRE', raise: 'RELANCER', allin: 'RELANCER' };
    return map[playerAction] === recommendedAction;
  }

  _actionLabel(action) {
    const map = { fold: 'te coucher', check: 'checker', call: 'suivre', raise: 'relancer', allin: 'fait tapis' };
    return map[action] || action;
  }

  /**
   * Explication du classement de la main gagnante (utilisée au showdown pour la pédagogie).
   */
  explainHandRank(rankIndex) {
    const info = CONFIG.HAND_RANKINGS_INFO.find(h => h.rank === rankIndex + 1);
    return info ? `${info.name} : ${info.desc}` : '';
  }
}

if (typeof module !== 'undefined') module.exports = PokerCoach;
