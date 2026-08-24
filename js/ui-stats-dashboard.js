/**
 * ui-stats-dashboard.js — Tableau de bord statistique (5 onglets).
 */

const UIStatsDashboard = {
  currentTab: 'overview',

  async render() {
    let sessions = await statsManager.getRecentSessions(50);

    // Si une session est en cours (non encore terminée/sauvegardée), calcule ses stats à la volée
    // pour que le dashboard reflète la progression immédiate, sans attendre la fin de session.
    if (typeof App !== 'undefined' && App.session && App.session.sessionId) {
      const liveSession = { ...App.session };
      try {
        const hands = await statsManager.getHandsForSession(liveSession.sessionId);
        liveSession.finalBankroll = App.currentHand
          ? App.currentHand.players[App.humanSeatId]?.stack ?? liveSession.startBankroll
          : liveSession.startBankroll;
        liveSession.computedStats = statsManager.computeSessionStats(liveSession, hands);
        liveSession.handProfitHistory = App.handProfitHistory || [];
        sessions = [liveSession, ...sessions.filter(s => s.sessionId !== liveSession.sessionId)];
      } catch (e) { console.error(e); }
    }

    const cumulative = await statsManager.getCumulativeStats();
    this._sessions = sessions;
    this._cumulative = cumulative;
    this.renderTab(this.currentTab);
  },

  async renderTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const content = document.getElementById('dashboard-content');

    if (!this._sessions || this._sessions.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🃏</span>
          <p>Aucune session jouée pour l'instant.<br>Lance ta première partie pour voir tes statistiques ici.</p>
        </div>`;
      return;
    }

    switch (tab) {
      case 'overview': content.innerHTML = this._renderOverview(); break;
      case 'position': content.innerHTML = this._renderPosition(); break;
      case 'hands': content.innerHTML = this._renderHands(); break;
      case 'progression': content.innerHTML = this._renderProgression(); break;
      case 'history': content.innerHTML = this._renderHistory(); this._attachHistoryHandlers(); break;
    }
  },

  _renderOverview() {
    const last = this._sessions[0];
    const stats = last.computedStats || {};
    const roiClass = stats.roi > 0 ? 'positive' : (stats.roi < 0 ? 'negative' : '');
    const plClass = stats.profitLoss > 0 ? 'positive' : (stats.profitLoss < 0 ? 'negative' : '');

    const profitSeries = (last.handProfitHistory || []).slice(-40);
    const maxAbs = Math.max(1, ...profitSeries.map(v => Math.abs(v)));
    const bars = profitSeries.map(v => {
      const height = Math.max(2, Math.round((Math.abs(v) / maxAbs) * 100));
      return `<div class="bar${v < 0 ? ' negative' : ''}" style="height:${height}%"></div>`;
    }).join('');

    return `
      <div class="stat-cards-grid">
        <div class="stat-card"><div class="stat-label">ROI session</div><div class="stat-value ${roiClass}">${stats.roi > 0 ? '+' : ''}${stats.roi ?? 0}%</div></div>
        <div class="stat-card"><div class="stat-label">Mains jouées</div><div class="stat-value">${stats.totalHands ?? 0}</div></div>
        <div class="stat-card"><div class="stat-label">Victoires / Défaites</div><div class="stat-value">${stats.wins ?? 0} / ${stats.losses ?? 0}</div></div>
        <div class="stat-card"><div class="stat-label">Durée</div><div class="stat-value">${stats.durationMinutes ?? 0} min</div></div>
        <div class="stat-card"><div class="stat-label">Profit / Perte</div><div class="stat-value ${plClass}">${stats.profitLoss > 0 ? '+' : ''}${stats.profitLoss ?? 0} jetons</div></div>
        <div class="stat-card"><div class="stat-label">BB / 100 mains</div><div class="stat-value">${stats.bb100 ?? 0}</div></div>
      </div>
      <h3 style="color:var(--brass-400); font-family:var(--font-display); margin-bottom:8px;">Profit par main (dernière session)</h3>
      <div class="simple-chart">${bars || '<span style="opacity:0.5;">Pas de données</span>'}</div>
    `;
  },

  _renderPosition() {
    const stats = this._sessions[0].computedStats || {};
    const positions = Object.entries(stats.positionStats || {});
    if (positions.length === 0) return `<div class="empty-state"><p>Pas encore de données positionnelles.</p></div>`;

    const rows = positions.map(([pos, s]) => {
      const winRate = s.hands > 0 ? Math.round((s.wins / s.hands) * 100) : 0;
      const foldRate = s.hands > 0 ? Math.round((s.folds / s.hands) * 100) : 0;
      const aggro = s.hands > 0 ? Math.round((s.raises / s.hands) * 100) : 0;
      return `<tr><td>${pos}</td><td>${s.hands}</td><td>${winRate}%</td><td>${foldRate}%</td><td>${aggro}%</td></tr>`;
    }).join('');

    return `
      <table class="data-table">
        <thead><tr><th>Position</th><th>Mains</th><th>% Victoire</th><th>% Fold</th><th>Agressivité</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },

  _renderHands() {
    const stats = this._sessions[0].computedStats || {};
    const tiers = Object.entries(stats.tierStats || {});
    if (tiers.length === 0) return `<div class="empty-state"><p>Pas encore de données sur les types de mains.</p></div>`;

    const labels = { premium: 'Mains premium', strong: 'Mains fortes', medium: 'Mains moyennes', weak: 'Mains faibles' };
    const rows = tiers.map(([tier, s]) => {
      const winRate = s.played > 0 ? Math.round((s.won / s.played) * 100) : 0;
      return `<tr><td>${labels[tier] || tier}</td><td>${s.played}</td><td>${winRate}%</td></tr>`;
    }).join('');

    const total = tiers.reduce((sum, [, s]) => sum + s.played, 0);
    const pieBars = tiers.map(([tier, s]) => {
      const pct = total > 0 ? Math.round((s.played / total) * 100) : 0;
      return `<div class="bar" style="height:${Math.max(4, pct)}%" title="${labels[tier]}: ${pct}%"></div>`;
    }).join('');

    return `
      <h3 style="color:var(--brass-400); font-family:var(--font-display); margin-bottom:8px;">Répartition des mains jouées</h3>
      <div class="simple-chart">${pieBars}</div>
      <table class="data-table">
        <thead><tr><th>Type de main</th><th>Mains jouées</th><th>% Victoire</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  },

  _renderProgression() {
    const sessions = [...this._sessions].reverse();
    const roiSeries = sessions.map(s => s.computedStats?.roi ?? 0);
    const maxAbs = Math.max(1, ...roiSeries.map(v => Math.abs(v)));
    const bars = roiSeries.map(v => {
      const height = Math.max(2, Math.round((Math.abs(v) / maxAbs) * 100));
      return `<div class="bar${v < 0 ? ' negative' : ''}" style="height:${height}%" title="${v}%"></div>`;
    }).join('');

    const records = this._cumulative.personalRecords || {};
    const beatenLevels = this._cumulative.difficultyLevelsBeaten || [];

    const badges = [1, 2, 3, 4, 5].map(lvl => {
      const beaten = beatenLevels.includes(lvl);
      return `<span class="diff-badge${beaten ? ' beaten' : ''}">Niveau ${lvl} ${beaten ? '✓' : '⚪'}</span>`;
    }).join('');

    return `
      <h3 style="color:var(--brass-400); font-family:var(--font-display); margin-bottom:8px;">Tendance du ROI (sessions récentes)</h3>
      <div class="simple-chart">${bars}</div>

      <h3 style="color:var(--brass-400); font-family:var(--font-display); margin:20px 0 10px;">Records personnels</h3>
      <div class="records-list">
        <div class="record-row"><span>Plus gros gain</span><strong>+${records.biggestWin || 0} jetons</strong></div>
        <div class="record-row"><span>Plus grosse perte</span><strong>${records.biggestLoss || 0} jetons</strong></div>
        <div class="record-row"><span>Meilleur taux de victoire</span><strong>${records.bestWinRate || 0}%</strong></div>
      </div>

      <h3 style="color:var(--brass-400); font-family:var(--font-display); margin-bottom:10px;">Progression de difficulté</h3>
      <div class="difficulty-badges">${badges}</div>
    `;
  },

  _renderHistory() {
    const rows = this._sessions.map(s => {
      const stats = s.computedStats || {};
      const date = new Date(s.startTime).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
      const plClass = stats.profitLoss > 0 ? 'positive' : (stats.profitLoss < 0 ? 'negative' : '');
      return `<tr data-session-id="${s.sessionId}" style="cursor:pointer;">
        <td>${date}</td>
        <td>Niveau ${s.difficultyLevel}</td>
        <td>${stats.durationMinutes ?? 0} min</td>
        <td>${stats.totalHands ?? 0}</td>
        <td class="${plClass}">${stats.profitLoss > 0 ? '+' : ''}${stats.profitLoss ?? 0}</td>
        <td>${stats.roi ?? 0}%</td>
      </tr>`;
    }).join('');

    return `
      <table class="data-table">
        <thead><tr><th>Date</th><th>Difficulté</th><th>Durée</th><th>Mains</th><th>P/L</th><th>ROI</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button id="btn-export-data" class="btn-secondary" style="width:100%;">⬇ Exporter les données (JSON)</button>
    `;
  },

  _attachHistoryHandlers() {
    const btn = document.getElementById('btn-export-data');
    if (btn) btn.onclick = () => this._exportData();
  },

  async _exportData() {
    const sessions = await statsManager.getAllSessions();
    const cumulative = await statsManager.getCumulativeStats();
    const data = { sessions, cumulative, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `poker-coach-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
