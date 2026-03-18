import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

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
