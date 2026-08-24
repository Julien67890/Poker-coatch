/**
 * ui-table.js — Rendu visuel de la table de poker (cartes, sièges, pot).
 */

const UITable = {
  cardHTML(card, opts = {}) {
    if (!card) return `<div class="playing-card back${opts.large ? ' large' : ''}"></div>`;
    const isRed = card.suit === '♥' || card.suit === '♦';
    return `<div class="playing-card${isRed ? ' red' : ''}${opts.large ? ' large' : ''}">${card.rank}${card.suit}</div>`;
  },

  cardBackHTML(large = false) {
    return `<div class="playing-card back${large ? ' large' : ''}"></div>`;
  },

  renderCommunityCards(communityCards) {
    const el = document.getElementById('community-cards');
    const slots = 5;
    let html = '';
    for (let i = 0; i < slots; i++) {
      html += communityCards[i] ? this.cardHTML(communityCards[i]) : `<div class="playing-card back" style="opacity:0.15"></div>`;
    }
    el.innerHTML = html;
  },

  renderPlayerCards(holeCards, revealed = true) {
    const el = document.getElementById('player-cards');
    if (!holeCards || holeCards.length === 0) { el.innerHTML = ''; return; }
    el.innerHTML = holeCards.map(c => revealed ? this.cardHTML(c, { large: true }) : this.cardBackHTML(true)).join('');
  },

  /**
   * Positionne les sièges adversaires autour de la table en ellipse.
   * opponents: [{ id, name, stack, folded, lastAction, holeCards, revealed, acting }]
   */
  renderOpponentSeats(opponents) {
    const container = document.getElementById('opponent-seats');
    container.innerHTML = '';
    const n = opponents.length;
    if (n === 0) return;

    // Angles répartis sur le pourtour supérieur de l'ellipse, en évitant la zone du joueur (bas, ~270°)
    // et en laissant de la marge aux extrémités pour ne pas chevaucher le joueur.
    const startAngle = 170;
    const endAngle = 10;
    const angleStep = n > 1 ? (startAngle - endAngle) / (n - 1) : 0;

    opponents.forEach((opp, i) => {
      const angle = n === 1 ? 270 : startAngle - i * angleStep;
      const rad = (angle * Math.PI) / 180;
      const rx = 46, ry = 40; // rayon en % du conteneur
      const x = 50 + rx * Math.cos(rad);
      const y = 38 + ry * Math.sin(rad);

      const seatDiv = document.createElement('div');
      seatDiv.className = `opp-seat${opp.folded ? ' folded' : ''}${opp.acting ? ' acting' : ''}`;
      seatDiv.style.left = `${Math.min(92, Math.max(8, x))}%`;
      seatDiv.style.top = `${Math.min(78, Math.max(6, y))}%`;
      seatDiv.id = `opp-seat-${opp.id}`;

      const cardsHTML = opp.holeCards
        ? opp.holeCards.map(c => opp.revealed ? this.cardHTML(c) : this.cardBackHTML()).join('')
        : `${this.cardBackHTML()}${this.cardBackHTML()}`;

      seatDiv.innerHTML = `
        <div class="seat-cards">${cardsHTML}</div>
        <div class="seat-info">
          <span class="seat-name">${opp.name}${opp.position ? ' · ' + opp.position : ''}</span>
          <span class="seat-stack">${opp.stack}</span>
          ${opp.lastAction ? `<span class="opp-last-action">${opp.lastAction}</span>` : ''}
        </div>
      `;
      container.appendChild(seatDiv);
    });
  },

  updatePot(amount) {
    document.getElementById('pot-value').textContent = amount;
    document.getElementById('pot-chip-display').textContent = amount;
  },

  updatePlayerStack(amount) {
    document.getElementById('player-stack').textContent = amount;
  },

  updateHandNumber(n) {
    document.getElementById('hand-number').textContent = n;
  },

  updateTableName(text) {
    document.getElementById('table-name').textContent = text;
  },

  updateBlinds(sb, bb) {
    document.getElementById('blinds-display').textContent = `${sb} / ${bb}`;
  },

  updateAnalysis({ handStr, boardStr, equity, potOddsText }) {
    document.getElementById('analysis-hand').textContent = handStr || '—';
    document.getElementById('analysis-board').textContent = boardStr || '—';
    document.getElementById('analysis-equity').textContent = equity != null ? `${equity}%` : '—';
    document.getElementById('analysis-potodds').textContent = potOddsText || '—';
  },

  showActionButtons({ canCheck, canCall, callAmount, minRaise, maxRaise, canRaise }) {
    const btnFold = document.getElementById('btn-fold');
    const btnCheck = document.getElementById('btn-check');
    const btnCall = document.getElementById('btn-call');
    const btnRaise = document.getElementById('btn-raise');
    const btnAllin = document.getElementById('btn-allin');
    const raiseRow = document.getElementById('raise-slider-row');

    btnCheck.style.display = canCheck ? '' : 'none';
    btnCall.style.display = canCheck ? 'none' : '';
    btnCall.textContent = canCheck ? 'Suivre' : `Suivre ${callAmount}`;
    btnRaise.disabled = !canRaise;
    raiseRow.style.display = canRaise ? 'flex' : 'none';

    if (canRaise) {
      const slider = document.getElementById('raise-slider');
      slider.min = minRaise;
      slider.max = maxRaise;
      slider.value = minRaise;
      document.getElementById('raise-amount-display').textContent = minRaise;
    }
  },

  disableActionButtons() {
    ['btn-fold', 'btn-check', 'btn-call', 'btn-raise', 'btn-allin'].forEach(id => {
      document.getElementById(id).disabled = true;
    });
  },
  enableActionButtons() {
    ['btn-fold', 'btn-check', 'btn-call', 'btn-raise', 'btn-allin'].forEach(id => {
      document.getElementById(id).disabled = false;
    });
  },

  showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
};
