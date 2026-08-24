/**
 * learning-mode.js — Centre d'apprentissage (tutoriel intégré, sections dépliables).
 */

const LearningMode = {
  render() {
    const el = document.getElementById('learning-content');
    el.innerHTML = `
      ${this._handRankingsSection()}
      ${this._positionSection()}
      ${this._potOddsSection()}
      ${this._bankrollSection()}
      ${this._mistakesSection()}
      ${this._glossarySection()}
    `;
  },

  _handRankingsSection() {
    const items = [...CONFIG.HAND_RANKINGS_INFO].sort((a, b) => b.rank - a.rank);
    const rows = items.map(h => `
      <div class="hand-rank-item">
        <span><span class="rank-num">${h.rank}.</span>${h.name}</span>
        <span style="opacity:0.7;">${h.desc}</span>
      </div>`).join('');
    return `
      <details class="learn-section" open>
        <summary>🏆 Classement des mains</summary>
        <div class="learn-section-body">${rows}</div>
      </details>`;
  },

  _positionSection() {
    return `
      <details class="learn-section">
        <summary>📍 Stratégie de position</summary>
        <div class="learn-section-body">
          <p>Ta position à table détermine combien d'informations tu as avant d'agir. Plus tu agis tard, plus tu en sais sur les intentions des autres.</p>
          <ul>
            <li><strong>UTG (Under The Gun)</strong> : premier à parler, aucune information. Joue serré (mains premium uniquement).</li>
            <li><strong>MP (Middle Position)</strong> : un peu plus d'informations, range légèrement élargie.</li>
            <li><strong>CO (Cut-off)</strong> : avant-dernière position, bonne pour ouvrir avec des mains moyennes.</li>
            <li><strong>BTN (Bouton)</strong> : la meilleure position — tu agis en dernier à chaque tour post-flop. Joue large.</li>
            <li><strong>SB (Petite blind)</strong> : mise forcée, position difficile post-flop.</li>
            <li><strong>BB (Grosse blind)</strong> : mise forcée, dernier à parler préflop.</li>
          </ul>
          <p>Règle générale : plus tu es en position tardive, plus tu peux jouer de mains différentes.</p>
        </div>
      </details>`;
  },

  _potOddsSection() {
    return `
      <details class="learn-section">
        <summary>🧮 Pot odds — comment les calculer</summary>
        <div class="learn-section-body">
          <p>Les pot odds comparent la taille du pot à la mise que tu dois payer pour continuer.</p>
          <p><strong>Formule :</strong> Pot odds = Taille du pot ÷ Mise à suivre</p>
          <p>Exemple : le pot fait 150 jetons, tu dois suivre 50 jetons → pot odds de 3:1. Cela signifie que tu as besoin de gagner au moins 1 fois sur 4 (25%) pour que suivre soit rentable sur le long terme.</p>
          <p>Compare ce pourcentage requis à ton équité (chance de gagner) : si ton équité est supérieure, suivre est justifié.</p>
        </div>
      </details>`;
  },

  _bankrollSection() {
    return `
      <details class="learn-section">
        <summary>💰 Gestion de bankroll</summary>
        <div class="learn-section-body">
          <ul>
            <li>Ne mise jamais plus de 5% de ta bankroll totale sur une seule session.</li>
            <li>Adapte la taille des blinds à ton tapis : viser environ 100 grosses blindes de profondeur.</li>
            <li>Ne poursuis pas tes pertes en augmentant tes mises après une mauvaise session.</li>
            <li>Une bonne gestion de bankroll te permet de survivre à la variance naturelle du poker.</li>
          </ul>
        </div>
      </details>`;
  },

  _mistakesSection() {
    return `
      <details class="learn-section">
        <summary>⚠️ Erreurs courantes des débutants</summary>
        <div class="learn-section-body">
          <ul>
            <li><strong>Trop bluffer :</strong> un bluff n'est efficace que si ton adversaire peut réellement se coucher. Bluffer un joueur qui suit toujours ne sert à rien.</li>
            <li><strong>Suivre avec des mains faibles :</strong> "je suis déjà engagé" n'est pas une raison valable pour continuer à payer.</li>
            <li><strong>Ignorer la position :</strong> jouer les mêmes mains en UTG et au bouton est une erreur fréquente.</li>
            <li><strong>Sur-valoriser les petites paires :</strong> une paire de 4 n'est forte que si tu touches un brelan.</li>
            <li><strong>Ne pas s'adapter à l'adversaire :</strong> un joueur serré et un joueur agressif se jouent différemment.</li>
          </ul>
        </div>
      </details>`;
  },

  _glossarySection() {
    const terms = [
      ['Fold (se coucher)', 'Abandonner la main, ne rien miser de plus.'],
      ['Check', 'Passer sans miser, seulement possible si personne n\'a misé avant toi.'],
      ['Call (suivre)', 'Égaler la mise de l\'adversaire pour rester dans la main.'],
      ['Raise (relancer)', 'Miser plus que la mise en cours.'],
      ['All-in (tapis)', 'Miser tous ses jetons restants.'],
      ['Blinds', 'Mises forcées postées avant de voir les cartes (petite et grosse blind).'],
      ['Flop / Turn / River', 'Les 3 premières cartes communes, puis la 4e, puis la 5e.'],
      ['Équité', 'Pourcentage de chance de gagner la main à l\'abattage.'],
      ['Range', 'Ensemble des mains probables d\'un adversaire dans une situation donnée.'],
      ['GTO', 'Game Theory Optimal — stratégie théoriquement inexploitable.']
    ];
    const rows = terms.map(([t, d]) => `<div class="hand-rank-item"><span><strong>${t}</strong></span><span style="opacity:0.7; text-align:right; max-width:60%;">${d}</span></div>`).join('');
    return `
      <details class="learn-section">
        <summary>📚 Glossaire</summary>
        <div class="learn-section-body">${rows}</div>
      </details>`;
  }
};
