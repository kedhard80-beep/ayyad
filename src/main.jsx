import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// ─────────────────────────────────────────────────────────────────────────────
// Observer GLOBAL pour les classes utilitaires .ayyad-reveal* du design system
// Ces classes définissent opacity:0 par défaut + ajoutent .is-visible quand
// l'élément entre dans la vue. Sans cet observer, le contenu resterait invisible.
// (Le composant <Reveal> attache son propre observer, ce code couvre TOUS les
//  autres éléments qui portent les classes utilitaires.)
// ─────────────────────────────────────────────────────────────────────────────
const REVEAL_SELECTORS = ".ayyad-reveal, .ayyad-reveal-left, .ayyad-reveal-right, .ayyad-reveal-scale";
let revealObserver = null;
function attachRevealObserver() {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          revealObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.10, rootMargin: "0px 0px -40px 0px" });
  }
  document.querySelectorAll(REVEAL_SELECTORS).forEach((el) => {
    if (!el.classList.contains("is-visible")) revealObserver.observe(el);
  });
}
// Au chargement initial, et à chaque modification du DOM (React rerender),
// on rescanne pour attacher l'observer aux nouveaux éléments .ayyad-reveal*.
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachRevealObserver);
  } else {
    attachRevealObserver();
  }
  // Surveille les ajouts d'éléments (changements de page React)
  if (typeof MutationObserver !== "undefined") {
    const mo = new MutationObserver(() => attachRevealObserver());
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener("DOMContentLoaded", () => mo.observe(document.body, { childList: true, subtree: true }));
  }
}

class RootErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("RootErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#fff", fontFamily: "sans-serif", padding: "24px"
        }}>
          <div style={{
            maxWidth: 480, width: "100%", background: "#fef2f2",
            border: "1px solid #fecaca", borderRadius: 16, padding: 24
          }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#dc2626", marginBottom: 8 }}>
              ⚠️ Une erreur s'est produite
            </div>
            <div style={{
              fontSize: 12, fontFamily: "monospace", background: "#fee2e2",
              borderRadius: 8, padding: 12, marginBottom: 16,
              wordBreak: "break-all", color: "#991b1b"
            }}>
              {this.state.error?.message || String(this.state.error)}
            </div>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.href = "/"; }}
              style={{
                background: "#dc2626", color: "#fff", border: "none",
                borderRadius: 8, padding: "10px 20px", fontWeight: 700,
                cursor: "pointer", fontSize: 14
              }}
            >
              🔄 Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </RootErrorBoundary>
)
