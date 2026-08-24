/**
 * ui-coach-panel.js — Affichage du panneau coach selon le mode.
 */

const UICoachPanel = {
  showLearningExplanation(text, onNext) {
    const panel = document.getElementById('coach-panel');
    panel.style.display = 'block';
    panel.innerHTML = `
      <div>${text}</div>
      <button class="coach-close" id="coach-next-btn">Compris, continuer →</button>
    `;
    document.getElementById('coach-next-btn').onclick = () => {
      panel.style.display = 'none';
      onNext();
    };
  },

  showInteractiveTip(tip) {
    const panel = document.getElementById('coach-panel');
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="coach-action">${tip.action}</div>
      <div>${tip.justification}</div>
      <div style="margin-top:6px; opacity:0.8;">${tip.potOddsText}</div>
      ${tip.tendencyNote ? `<div style="margin-top:6px; opacity:0.75; font-style:italic;">${tip.tendencyNote}</div>` : ''}
      <button class="coach-close" id="coach-close-btn">Fermer</button>
    `;
    document.getElementById('coach-close-btn').onclick = () => {
      panel.style.display = 'none';
    };
  },

  hide() {
    document.getElementById('coach-panel').style.display = 'none';
  },

  updateQuickStats(text) {
    document.getElementById('quick-stats-text').textContent = text;
  },

  showShowdown({ title, handsHTML, summary, coachFeedback }) {
    document.getElementById('showdown-title').textContent = title;
    document.getElementById('showdown-hands').innerHTML = handsHTML;
    document.getElementById('showdown-summary').textContent = summary;
    const feedbackEl = document.getElementById('coach-feedback');
    if (coachFeedback) {
      feedbackEl.style.display = 'block';
      feedbackEl.textContent = coachFeedback;
    } else {
      feedbackEl.style.display = 'none';
    }
    document.getElementById('showdown-overlay').style.display = 'flex';
  },

  hideShowdown() {
    document.getElementById('showdown-overlay').style.display = 'none';
  },

  showSessionEnd(summary) {
    document.getElementById('session-end-summary').textContent = summary;
    document.getElementById('session-end-overlay').style.display = 'flex';
  },

  hideSessionEnd() {
    document.getElementById('session-end-overlay').style.display = 'none';
  }
};
