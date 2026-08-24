/**
 * app.js — Point d'entrée principal, orchestration du jeu et des écrans.
 */

const App = {
  // Config de session choisie sur l'écran d'accueil
  mode: 'interactive', // 'learning' | 'interactive'
  tableType: 'headsup', // 'headsup' | 'sixmax'
  difficulty: 2,
  bankroll: 1000,

  // État de session
  session: null,
  table: null,
  currentHand: null,
  coach: null,
  handHistoryBuffer: [], // actions du joueur pour la main en cours (pour les stats)
  sessionEquitySum: 0,
  sessionEquityCount: 0,
  timerInterval: null,
  awaitingHumanAction: false,
  humanSeatId: 'human',
  pendingLearningExplanation: null,

  async init() {
    this.coach = new PokerCoach();
    try {
      await statsManager.init();
    } catch (e) {
      console.error('IndexedDB init failed', e);
    }
    this._bindHomeScreen();
    this._bindTableScreen();
    this._bindDashboard();
    this._bindLearning();
    this._registerServiceWorker();
    this._updateDifficultyUI();
    this._updateBankrollUI();
  },

  // ===================== ÉCRAN D'ACCUEIL =====================
  _bindHomeScreen() {
    document.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.mode = btn.dataset.mode;
        this._updateDifficultyLockUI();
      });
    });
    document.querySelector('[data-mode="interactive"]').classList.add('selected');

    document.querySelectorAll('[data-table]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-table]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.tableType = btn.dataset.table;
      });
    });
    document.querySelector('[data-table="headsup"]').classList.add('selected');

    const diffSlider = document.getElementById('difficulty-slider');
    diffSlider.addEventListener('input', () => {
      this.difficulty = Number(diffSlider.value);
      this._updateDifficultyUI();
    });

    const bankrollSlider = document.getElementById('bankroll-slider');
    bankrollSlider.addEventListener('input', () => {
      this.bankroll = Number(bankrollSlider.value);
      this._updateBankrollUI();
    });

    document.getElementById('btn-start-session').addEventListener('click', () => this.startSession());
    document.getElementById('btn-open-learning-center').addEventListener('click', () => this.showScreen('learning'));
    document.getElementById('btn-open-dashboard').addEventListener('click', () => this.showScreen('dashboard'));
  },

  _updateDifficultyLockUI() {
    const note = document.getElementById('difficulty-locked-note');
    const slider = document.getElementById('difficulty-slider');
    if (this.mode === 'learning') {
      note.style.display = 'block';
      slider.max = 2;
      if (this.difficulty > 2) { this.difficulty = 2; slider.value = 2; }
      this._updateDifficultyUI();
    } else {
      note.style.display = 'none';
      slider.max = 5;
    }
  },

  _updateDifficultyUI() {
    const lvl = CONFIG.DIFFICULTY_LEVELS[this.difficulty];
    document.getElementById('difficulty-name').textContent = lvl.name;
    document.getElementById('difficulty-desc').textContent = lvl.description;
  },

  _updateBankrollUI() {
    document.getElementById('bankroll-value').textContent = `${this.bankroll} jetons`;
    const bb = CONFIG.bigBlindForBankroll(this.bankroll);
    document.getElementById('blinds-preview').textContent = `Blinds : ${bb / 2} / ${bb}`;
  },

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'dashboard') UIStatsDashboard.render();
    if (name === 'learning') LearningMode.render();
  },

  // ===================== DÉMARRAGE DE SESSION =====================
  async startSession() {
    const bb = CONFIG.bigBlindForBankroll(this.bankroll);
    const sb = bb / 2;
    const nSeats = this.tableType === 'headsup' ? 2 : 6;

    const seats = [{ id: this.humanSeatId, name: 'Toi', isHuman: true, stack: this.bankroll }];
    for (let i = 1; i < nSeats; i++) {
      seats.push({
        id: `ai${i}`, name: `IA Niveau ${this.difficulty}`, isHuman: false,
        stack: this.bankroll, aiInstance: new AIOpponent(`ai${i}`, `IA Niveau ${this.difficulty}`, this.difficulty)
      });
    }

    this.table = new TableEngine(seats, sb, bb);
    this.session = {
      sessionId: `s_${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      difficultyLevel: this.difficulty,
      mode: this.mode,
      tableType: this.tableType,
      startBankroll: this.bankroll,
      finalBankroll: this.bankroll,
      bigBlind: bb,
      handsPlayed: 0
    };
    this.handProfitHistory = [];
    this.sessionEquitySum = 0;
    this.sessionEquityCount = 0;
    this._lastKnownStack = this.bankroll;

    try { await statsManager.createSession(this.session); } catch (e) { console.error(e); }

    UITable.updateTableName(`Table ${this.tableType === 'headsup' ? 'Tête-à-tête' : '6 joueurs'} — Niveau ${this.difficulty}`);
    UITable.updateBlinds(sb, bb);
    this.showScreen('table');
    this.playNextHand();
  },

  // ===================== BOUCLE DE JEU =====================
  playNextHand() {
    UICoachPanel.hideShowdown();
    UICoachPanel.hide();

    const activeSeats = this.table.activeSeats;
    const humanSeat = this.table.seats.find(s => s.id === this.humanSeatId);

    if (!humanSeat || humanSeat.stack <= 0) {
      this.endSession('Tu as fait tapis et perdu. La session est terminée.');
      return;
    }
    if (activeSeats.length < 2) {
      this.endSession('Tous les adversaires sont éliminés. Bravo !');
      return;
    }
    if (this.session.handsPlayed >= CONFIG.MAX_HANDS_PER_SESSION) {
      this.endSession('Limite de mains atteinte pour cette session.');
      return;
    }

    const hand = this.table.startHand();
    if (!hand) { this.endSession('Session terminée.'); return; }

    this.currentHand = hand;
    this.handHistoryBuffer = [];
    this.session.handsPlayed++;

    UITable.updateHandNumber(this.session.handsPlayed);
    UITable.updatePot(hand.pot);
    UITable.renderPlayerCards(hand.players[this.humanSeatId].holeCards, true);
    this._renderOpponents();
    UITable.renderCommunityCards([]);
    UITable.updatePlayerStack(hand.players[this.humanSeatId].stack);

    const btnAskCoach = document.getElementById('btn-ask-coach');
    btnAskCoach.style.display = this.mode === 'interactive' ? 'block' : 'none';

    this.processNextAction();
  },

  _renderOpponents() {
    const hand = this.currentHand;
    const opponents = hand.order.filter(id => id !== this.humanSeatId).map(id => {
      const p = hand.players[id];
      return {
        id: p.id, name: p.name, stack: p.stack, folded: p.folded,
        position: p.position,
        acting: [...(hand.playersToAct || [])][0] === id,
        lastAction: this._lastActionLabel(id)
      };
    });
    UITable.renderOpponentSeats(opponents);
  },

  _lastActionLabel(playerId) {
    const hist = this.currentHand.actionHistory.filter(a => a.playerId === playerId);
    if (hist.length === 0) return '';
    const last = hist[hist.length - 1];
    const labels = { fold: 'Se couche', check: 'Check', call: 'Suit', raise: `Relance ${last.amount}`, allin: 'Tapis', small_blind: 'SB', big_blind: 'BB' };
    return labels[last.action] || '';
  },

  /**
   * Boucle principale : fait avancer les tours d'action / rues jusqu'au showdown.
   */
  processNextAction() {
    const hand = this.currentHand;

    if (this.table.isBettingRoundOver(hand)) {
      const remaining = this.table.getRemainingPlayers(hand);
      if (remaining.length <= 1 || hand.street === 'river') {
        this._resolveCurrentHand();
        return;
      }
      this.table.advanceStreet(hand);
      UITable.renderCommunityCards(hand.communityCards);
      UITable.updatePot(hand.pot);
      this._renderOpponents();
      this.processNextAction();
      return;
    }

    const nextId = [...hand.playersToAct][0];
    if (!nextId) { this._resolveCurrentHand(); return; }

    const player = hand.players[nextId];

    if (player.isHuman) {
      this._promptHumanAction(player);
    } else {
      // Léger délai pour simuler la "réflexion" de l'IA (perceptible mais rapide, < 1s)
      setTimeout(() => this._playAIAction(player), 400 + Math.random() * 400);
    }
  },

  _playAIAction(player) {
    const hand = this.currentHand;
    const toCall = hand.currentBetLevel - player.currentBet;
    const decision = player.aiInstance.decide({
      holeCards: player.holeCards, communityCards: hand.communityCards,
      potSize: hand.pot, amountToCall: toCall, stack: player.stack,
      position: player.position, minRaise: hand.currentBetLevel + hand.lastRaiseSize,
      street: hand.street, tableSize: this.table.seats.length, playerRaised: toCall > 0
    });
    player.aiInstance.recordHandPlayed(player.position);
    this.table.applyAction(hand, player.id, decision);
    UITable.updatePot(hand.pot);
    UITable.updatePlayerStack(hand.players[this.humanSeatId].stack);
    this._renderOpponents();
    this.processNextAction();
  },

  // ===================== ACTION DU JOUEUR HUMAIN =====================
  _promptHumanAction(player) {
    const hand = this.currentHand;
    const toCall = hand.currentBetLevel - player.currentBet;
    const canCheck = toCall === 0;
    const maxRaise = player.stack + player.currentBet;
    const minRaise = Math.min(maxRaise, hand.currentBetLevel + hand.lastRaiseSize);

    this._updateAnalysisPanel(player, toCall);

    UITable.showActionButtons({
      canCheck, canCall: !canCheck, callAmount: toCall,
      minRaise, maxRaise, canRaise: player.stack > 0
    });
    UITable.enableActionButtons();
    this.awaitingHumanAction = true;

    if (this.mode === 'learning') {
      this._showLearningExplanationBeforeDecision(player);
    }

    this._startDecisionTimer(() => {
      // Auto-fold (ou check si possible) au timeout
      this._submitHumanAction(canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 });
    });
  },

  _updateAnalysisPanel(player, toCall) {
    const hand = this.currentHand;
    const equity = PokerEngine.estimateEquity(player.holeCards, this.table.getRemainingPlayers(hand).length - 1 || 1, hand.communityCards, [], 350);
    const potOdds = PokerEngine.calculatePotOdds(hand.pot, toCall);
    this.sessionEquitySum += equity;
    this.sessionEquityCount++;
    this._lastEquity = equity;

    UITable.updateAnalysis({
      handStr: player.holeCards.map(PokerEngine.cardToString).join(' '),
      boardStr: hand.communityCards.length ? hand.communityCards.map(PokerEngine.cardToString).join(' ') : '—',
      equity,
      potOddsText: potOdds.ratio ? potOdds.text : '—'
    });
  },

  _showLearningExplanationBeforeDecision(player) {
    const hand = this.currentHand;
    const toCall = hand.currentBetLevel - player.currentBet;
    const opponentsCount = this.table.getRemainingPlayers(hand).length - 1 || 1;
    const explanation = this.coach.generatePreDecisionExplanation({
      holeCards: player.holeCards, communityCards: hand.communityCards,
      potSize: hand.pot, amountToCall: toCall, opponentsCount, position: player.position, street: hand.street
    });
    this.pendingLearningExplanation = explanation;
    UICoachPanel.showLearningExplanation(explanation.text, () => {});
  },

  _startDecisionTimer(onTimeout) {
    clearInterval(this.timerInterval);
    const timerEl = document.getElementById('decision-timer');
    const barEl = document.getElementById('timer-bar');
    const textEl = document.getElementById('timer-text');
    let remaining = CONFIG.DECISION_TIMER_SECONDS;
    timerEl.style.display = 'block';
    barEl.style.width = '100%';
    textEl.textContent = `${remaining}s`;

    this.timerInterval = setInterval(() => {
      remaining--;
      const pct = Math.max(0, (remaining / CONFIG.DECISION_TIMER_SECONDS) * 100);
      barEl.style.width = `${pct}%`;
      textEl.textContent = `${Math.max(0, remaining)}s`;
      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        timerEl.style.display = 'none';
        if (this.awaitingHumanAction) onTimeout();
      }
    }, 1000);
  },

  _bindTableScreen() {
    document.getElementById('btn-fold').addEventListener('click', () => this._submitHumanAction({ action: 'fold', amount: 0 }));
    document.getElementById('btn-check').addEventListener('click', () => this._submitHumanAction({ action: 'check', amount: 0 }));
    document.getElementById('btn-call').addEventListener('click', () => {
      const hand = this.currentHand;
      const p = hand.players[this.humanSeatId];
      this._submitHumanAction({ action: 'call', amount: hand.currentBetLevel - p.currentBet });
    });
    document.getElementById('btn-raise').addEventListener('click', () => {
      const amount = Number(document.getElementById('raise-slider').value);
      this._submitHumanAction({ action: 'raise', amount });
    });
    document.getElementById('btn-allin').addEventListener('click', () => {
      const p = this.currentHand.players[this.humanSeatId];
      this._submitHumanAction({ action: 'allin', amount: p.stack + p.currentBet });
    });

    document.getElementById('raise-slider').addEventListener('input', (e) => {
      document.getElementById('raise-amount-display').textContent = e.target.value;
    });

    document.getElementById('btn-ask-coach').addEventListener('click', () => this._askCoach());
    document.getElementById('btn-next-hand').addEventListener('click', () => this.playNextHand());
    document.getElementById('btn-back-home').addEventListener('click', () => {
      if (confirm('Quitter la session en cours ?')) { this.endSession('Session quittée.'); }
    });
    document.getElementById('btn-view-dashboard-ingame').addEventListener('click', () => this.showScreen('dashboard'));
    document.getElementById('btn-session-end-dashboard').addEventListener('click', () => {
      UICoachPanel.hideSessionEnd();
      this.showScreen('dashboard');
    });
    document.getElementById('btn-session-end-home').addEventListener('click', () => {
      UICoachPanel.hideSessionEnd();
      this.showScreen('home');
    });

    // Raccourcis clavier (desktop)
    document.addEventListener('keydown', (e) => {
      if (!this.awaitingHumanAction) return;
      const tag = document.activeElement.tagName;
      if (tag === 'INPUT') return;
      switch (e.key.toLowerCase()) {
        case 'f': document.getElementById('btn-fold').click(); break;
        case 'c': {
          const btn = document.getElementById('btn-check').style.display !== 'none'
            ? document.getElementById('btn-check') : document.getElementById('btn-call');
          btn.click();
          break;
        }
        case 'r': document.getElementById('btn-raise').click(); break;
        case 'a': document.getElementById('btn-allin').click(); break;
        case 'h': document.getElementById('btn-ask-coach').click(); break;
      }
    });
  },

  _askCoach() {
    const hand = this.currentHand;
    const player = hand.players[this.humanSeatId];
    const toCall = hand.currentBetLevel - player.currentBet;
    const opponentsCount = this.table.getRemainingPlayers(hand).length - 1 || 1;

    // Récupère la tendance d'un adversaire actif pour contextualiser le conseil
    let opponentTendency = null;
    const activeOpp = Object.values(hand.players).find(p => p.id !== this.humanSeatId && !p.folded && p.aiInstance);
    if (activeOpp) {
      const freq = activeOpp.aiInstance.getFoldToRaiseFrequency();
      if (freq !== null) opponentTendency = `${activeOpp.name} se couche à ${freq}% face aux relances.`;
    }

    const tip = this.coach.generateInteractiveTip({
      holeCards: player.holeCards, communityCards: hand.communityCards,
      potSize: hand.pot, amountToCall: toCall, opponentsCount, position: player.position,
      street: hand.street, opponentTendency
    });
    this._lastCoachRecommendation = tip.action;
    UICoachPanel.showInteractiveTip(tip);
  },

  _submitHumanAction(action) {
    if (!this.awaitingHumanAction) return;
    this.awaitingHumanAction = false;
    clearInterval(this.timerInterval);
    document.getElementById('decision-timer').style.display = 'none';
    UITable.disableActionButtons();
    UICoachPanel.hide();

    const hand = this.currentHand;
    this.handHistoryBuffer.push({ action: action.action, amount: action.amount, position: hand.players[this.humanSeatId].position, street: hand.street });

    if (this.mode === 'learning' && this.pendingLearningExplanation) {
      this._pendingPlayerAction = action.action;
      this._pendingRecommendation = this.pendingLearningExplanation.analysis.recommendation;
    }

    this.table.applyAction(hand, this.humanSeatId, action);
    UITable.updatePot(hand.pot);
    UITable.updatePlayerStack(hand.players[this.humanSeatId].stack);
    this._renderOpponents();
    this.processNextAction();
  },

  // ===================== RÉSOLUTION DE LA MAIN =====================
  async _resolveCurrentHand() {
    const hand = this.currentHand;
    const result = this.table.resolveHand(hand);
    const humanResult = result.results[this.humanSeatId];
    const humanWon = result.winners.includes(this.humanSeatId);
    const humanPlayer = hand.players[this.humanSeatId];
    const stackBeforeHand = this._lastKnownStack ?? this.bankroll;
    const profitThisHand = humanPlayer.stack - stackBeforeHand;

    // Révèle les cartes des joueurs restants au showdown
    const remaining = this.table.getRemainingPlayers(hand);
    let handsHTML = '';
    if (result.wentToShowdown) {
      for (const p of remaining) {
        const isWinner = result.winners.includes(p.id);
        const holeCardsHTML = p.holeCards.map(c => UITable.cardHTML(c)).join('');
        const rankResult = result.results[p.id];
        const rankName = rankResult?.rankName || '';
        // Affiche aussi les 5 cartes exactes qui composent la meilleure main (main + board),
        // pour que le classement affiché (ex. "Double paire") soit toujours vérifiable visuellement
        // même quand il provient en partie ou entièrement du board commun.
        const bestFiveHTML = rankResult?.bestFive
          ? `<span class="cards best-five">${rankResult.bestFive.map(c => UITable.cardHTML(c)).join('')}</span>`
          : '';
        handsHTML += `<div class="showdown-hand-row">
          <span>${p.id === this.humanSeatId ? 'Toi' : p.name}${isWinner ? ' 🏆' : ''}</span>
          <span class="cards">${holeCardsHTML}</span>
          <span style="opacity:0.7;">${rankName}</span>
        </div>
        ${bestFiveHTML ? `<div class="showdown-besthand-row"><span class="besthand-label">Meilleure main :</span>${bestFiveHTML}</div>` : ''}`;
      }
    }

    const wonAmount = result.amountWon[this.humanSeatId] || 0;
    const summary = result.wentToShowdown
      ? (humanWon ? `Tu remportes ${wonAmount} jetons à l'abattage.` : `Tu perds ce coup. ${remaining.find(p => result.winners.includes(p.id))?.name || 'L\'adversaire'} remporte le pot.`)
      : (humanWon ? `Tous les adversaires se sont couchés. Tu remportes ${hand.pot} jetons.` : `Tu t'es couché. Le pot est remporté par un adversaire.`);

    let coachFeedback = null;
    if (this.mode === 'learning' && this._pendingRecommendation) {
      coachFeedback = this.coach.generatePostHandFeedback(
        this._pendingPlayerAction, this._pendingRecommendation,
        { won: humanWon, amount: wonAmount }
      );
    }

    UITable.renderCommunityCards(hand.communityCards);
    UICoachPanel.showShowdown({
      title: humanWon ? '🏆 Tu gagnes !' : 'Main terminée',
      handsHTML: handsHTML || '<p style="opacity:0.7;">Les adversaires se sont couchés.</p>',
      summary,
      coachFeedback
    });

    // Enregistrement des stats
    const startingTier = PokerEngine.classifyStartingHand(humanPlayer.holeCards)?.tier;
    const handRecord = {
      sessionId: this.session.sessionId,
      handNumber: this.session.handsPlayed,
      playerPosition: humanPlayer.position,
      playerWon: humanWon,
      playerActions: this.handHistoryBuffer,
      startingTier,
      potAtEnd: hand.pot,
      street: hand.street,
      timestamp: new Date().toISOString()
    };
    try { await statsManager.saveHand(handRecord); } catch (e) { console.error(e); }

    this.handProfitHistory.push(profitThisHand);
    this._lastKnownStack = humanPlayer.stack;

    this._updateQuickStats();
    this.table.rotateDealer();
  },

  _updateQuickStats() {
    const avgEquity = this.sessionEquityCount > 0 ? Math.round(this.sessionEquitySum / this.sessionEquityCount) : 0;
    const humanStack = this.currentHand.players[this.humanSeatId].stack;
    const profit = humanStack - this.bankroll;
    UICoachPanel.updateQuickStats(`${this.session.handsPlayed} mains | ${profit >= 0 ? '+' : ''}${profit} jetons | ${avgEquity}% équité moy.`);
  },

  // ===================== FIN DE SESSION =====================
  async endSession(message) {
    clearInterval(this.timerInterval);
    if (!this.session) { this.showScreen('home'); return; }

    const humanSeat = this.table?.seats.find(s => s.id === this.humanSeatId);
    this.session.finalBankroll = humanSeat ? humanSeat.stack : this.session.startBankroll;
    this.session.endTime = new Date().toISOString();

    try {
      const hands = await statsManager.getHandsForSession(this.session.sessionId);
      const computedStats = statsManager.computeSessionStats(this.session, hands);
      this.session.computedStats = computedStats;
      this.session.handProfitHistory = this.handProfitHistory || [];
      await statsManager.updateSession(this.session);
      await this._updateCumulativeStats(this.session, computedStats);
    } catch (e) { console.error(e); }

    const profit = this.session.finalBankroll - this.session.startBankroll;
    UICoachPanel.showSessionEnd(`${message} Profit final : ${profit >= 0 ? '+' : ''}${profit} jetons (${this.session.computedStats?.roi ?? 0}% ROI) sur ${this.session.handsPlayed} mains.`);

    this.session = null;
    this.table = null;
    this.currentHand = null;
  },

  async _updateCumulativeStats(session, computedStats) {
    await statsManager.updateCumulativeStats((current) => {
      current.totalHandsPlayed += computedStats.totalHands;

      current.roiByDifficulty[session.difficultyLevel] = current.roiByDifficulty[session.difficultyLevel] || [];
      current.roiByDifficulty[session.difficultyLevel].push(computedStats.roi);

      for (const [pos, s] of Object.entries(computedStats.positionStats || {})) {
        current.handsByPosition[pos] = (current.handsByPosition[pos] || 0) + s.hands;
        current.winsByPosition[pos] = (current.winsByPosition[pos] || 0) + s.wins;
      }

      for (const [action, count] of Object.entries(computedStats.actionCounts || {})) {
        current.foldFrequencyByAction[action] = (current.foldFrequencyByAction[action] || 0) + count;
        current.foldFrequencyByAction.total += count;
      }

      for (const [tier, s] of Object.entries(computedStats.tierStats || {})) {
        current.handsByStartingTier[tier] = (current.handsByStartingTier[tier] || 0) + s.played;
        current.winsByStartingTier[tier] = (current.winsByStartingTier[tier] || 0) + s.won;
      }

      const profit = computedStats.profitLoss;
      current.personalRecords.biggestWin = Math.max(current.personalRecords.biggestWin, profit);
      current.personalRecords.biggestLoss = Math.min(current.personalRecords.biggestLoss, profit);
      const winRate = computedStats.totalHands > 0 ? Math.round((computedStats.wins / computedStats.totalHands) * 100) : 0;
      current.personalRecords.bestWinRate = Math.max(current.personalRecords.bestWinRate, winRate);

      // Un niveau est "battu" si le joueur termine une session avec un ROI positif à ce niveau
      if (computedStats.roi > 0 && !current.difficultyLevelsBeaten.includes(session.difficultyLevel)) {
        current.difficultyLevelsBeaten.push(session.difficultyLevel);
      }

      return current;
    });
  },

  // ===================== DASHBOARD & LEARNING BINDINGS =====================
  _bindDashboard() {
    document.getElementById('btn-dashboard-close').addEventListener('click', () => {
      this.showScreen(this.session ? 'table' : 'home');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => UIStatsDashboard.renderTab(btn.dataset.tab));
    });
  },

  _bindLearning() {
    document.getElementById('btn-learning-close').addEventListener('click', () => {
      this.showScreen(this.session ? 'table' : 'home');
    });
  },

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
