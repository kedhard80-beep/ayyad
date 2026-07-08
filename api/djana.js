export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Aidez Djana — 5 ans, opération urgente · AYYAD CI</title>
  <meta name="description" content="Djana a 5 ans. Elle a besoin d'une 2ème opération urgente. Chaque don compte.">
  <meta property="og:title" content="🚨 Djana, 5 ans — 2ème opération urgente">
  <meta property="og:description" content="Il reste 6 jours. 103 000 FCFA collectés sur 1 145 000 FCFA. Aidez-nous.">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;min-height:100vh;max-width:480px;margin:0 auto}
    .top-bar{background:linear-gradient(90deg,#c0130f,#dc2626,#ea580c);color:#fff;text-align:center;padding:11px 16px;font-size:13px;font-weight:700}
    .dot{display:inline-block;width:7px;height:7px;background:#fff;border-radius:50%;margin-right:6px;animation:ping 1.2s ease-in-out infinite}
    @keyframes ping{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}
    .hero{background:linear-gradient(180deg,#fff5f5 0%,#fff 100%);padding:28px 20px 20px;text-align:center}
    .avatar{width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#fca5a5,#dc2626);display:flex;align-items:center;justify-content:center;font-size:42px;margin:0 auto 16px;box-shadow:0 4px 20px rgba(220,38,38,.25)}
    .name{font-size:30px;font-weight:900;color:#111;letter-spacing:-.5px}
    .subtitle{font-size:15px;color:#dc2626;font-weight:700;margin-top:5px}
    .story{margin-top:13px;font-size:15px;color:#444;line-height:1.6;max-width:340px;margin-left:auto;margin-right:auto}
    .timer{display:inline-flex;align-items:center;gap:7px;background:#fef2f2;border:1.5px solid #fecaca;border-radius:20px;padding:7px 16px;margin-top:16px;font-size:13px;font-weight:800;color:#dc2626}
    .card{background:#f8fafc;border-radius:18px;padding:18px;margin:16px}
    .amounts{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px}
    .collected{font-size:24px;font-weight:900;color:#059669}
    .collected-label{font-size:11px;color:#888;margin-top:2px}
    .goal-block{text-align:right}
    .goal-label{font-size:11px;color:#888}
    .goal-amount{font-size:17px;font-weight:800;color:#333}
    .bar-bg{height:12px;background:#e5e7eb;border-radius:12px;overflow:hidden}
    .bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#059669,#10b981);border-radius:12px;transition:width 1.2s cubic-bezier(.4,0,.2,1)}
    .bar-label{font-size:11px;color:#888;margin-top:7px;display:flex;justify-content:space-between}
    .cta{padding:16px 20px 8px}
    .btn-wave{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:19px;border:none;border-radius:18px;cursor:pointer;background:linear-gradient(90deg,#059669,#10b981);color:#fff;font-size:19px;font-weight:900;text-decoration:none;box-shadow:0 6px 24px rgba(5,150,105,.4);animation:pulse-btn 2.5s ease-in-out infinite}
    @keyframes pulse-btn{0%,100%{box-shadow:0 6px 24px rgba(5,150,105,.4)}50%{box-shadow:0 8px 32px rgba(5,150,105,.65)}}
    .amounts-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 20px 4px}
    .amt{background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:10px 6px;text-align:center;cursor:pointer;text-decoration:none}
    .amt-num{font-size:14px;font-weight:800;color:#059669}
    .amt-label{font-size:10px;color:#888;margin-top:2px}
    .how{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:16px;padding:16px;margin:16px}
    .how-title{font-size:12px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:.6px;margin-bottom:12px}
    .step{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;font-size:14px;color:#333;line-height:1.45}
    .num{min-width:22px;height:22px;background:#059669;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;margin-top:1px}
    .secure{margin-top:12px;font-size:12px;color:#059669;font-weight:700;text-align:center}
    .dossier-link{display:block;text-align:center;color:#888;font-size:13px;text-decoration:none;padding:14px 20px;border-top:1px solid #f5f5f5;margin-top:4px}
    footer{text-align:center;padding:18px 20px 36px;border-top:1px solid #f0f0f0}
    footer p{font-size:12px;color:#bbb}
    footer a{color:#bbb;font-size:11px}
  </style>
</head>
<body>
  <div class="top-bar"><span class="dot"></span>URGENT &nbsp;·&nbsp; Il reste <strong>6 jours</strong> &nbsp;·&nbsp; Djana a besoin de vous</div>
  <div class="hero">
    <div class="avatar">👧🏾</div>
    <div class="name">Djana Coulibaly</div>
    <div class="subtitle">5 ans &nbsp;·&nbsp; Reconstruction appareil digestif</div>
    <p class="story">Djana doit subir une 2ème opération urgente pour reconstruire son appareil digestif. Sans votre aide aujourd'hui, sa famille ne peut pas financer les soins.</p>
    <div class="timer">🕐 Campagne se termine dans <strong>6 jours</strong></div>
  </div>
  <div class="card">
    <div class="amounts">
      <div><div class="collected">103 000 FCFA</div><div class="collected-label">collectés jusqu'ici</div></div>
      <div class="goal-block"><div class="goal-label">Objectif</div><div class="goal-amount">1 145 000 FCFA</div></div>
    </div>
    <div class="bar-bg"><div class="bar-fill" id="bar"></div></div>
    <div class="bar-label"><span>9% atteint</span><span>1 042 000 FCFA restants</span></div>
  </div>
  <div class="cta">
    <a href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/" class="btn-wave">🌊&nbsp; Donner maintenant via Wave</a>
  </div>
  <div class="amounts-grid">
    <a href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/" class="amt"><div class="amt-num">500 F</div><div class="amt-label">ça aide !</div></a>
    <a href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/" class="amt"><div class="amt-num">1 000 F</div><div class="amt-label">merci 🙏</div></a>
    <a href="https://pay.wave.com/m/M_ci_PJosg8FuvJDW/c/ci/" class="amt"><div class="amt-num">5 000 F</div><div class="amt-label">héros ❤️</div></a>
  </div>
  <div class="how">
    <div class="how-title">📱 Comment donner en 30 secondes</div>
    <div class="step"><div class="num">1</div><div>Appuyez sur <strong>"Donner maintenant via Wave"</strong></div></div>
    <div class="step"><div class="num">2</div><div>Entrez le montant — <strong>500 FCFA suffit</strong></div></div>
    <div class="step"><div class="num">3</div><div>Confirmez avec votre <strong>code PIN Wave</strong></div></div>
    <div class="secure">✅ 100% sécurisé · Géré par AYYAD CI</div>
  </div>
  <a href="https://www.ayyadci.com/?case=AYD-2026-06-001" class="dossier-link">📋 Voir le dossier médical complet de Djana →</a>
  <footer><p>Collecte organisée par <strong>AYYAD CI</strong></p><a href="https://www.ayyadci.com">www.ayyadci.com</a></footer>
  <script>setTimeout(()=>{document.getElementById('bar').style.width='9%'},300)</script>
</body>
</html>`);
}
