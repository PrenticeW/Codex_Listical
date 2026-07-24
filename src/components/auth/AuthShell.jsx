import { Link } from 'react-router-dom';
import wordmark from '../../assets/brand/tacular-wordmark-black.svg';
import './AuthShell.css';

/**
 * AuthShell
 *
 * Shared chrome for every unauthenticated page (login, signup,
 * forgot/reset password, account-deleted, 404) — the exposed dot-grid
 * stage, corner registration ticks, wordmark, and bracket-cornered card
 * frame from the design handover's auth reference
 * (reference/auth-pages/*.html in ListicalVisualHandover.zip).
 *
 * Purely presentational: takes no storage or routing dependencies, so it
 * can't violate the storage-module / cross-page-event rules in CLAUDE.md.
 */
export default function AuthShell({ eyebrow, maxWidth = 440, children, footer }) {
  return (
    <div className="auth-stage">
      <span className="auth-cross" style={{ left: 54, top: 54 }} />
      <span className="auth-cross" style={{ right: 54, top: 54 }} />
      <span className="auth-cross" style={{ left: 54, bottom: 54 }} />
      <span className="auth-cross" style={{ right: 54, bottom: 54 }} />
      <span className="auth-corner-annot" style={{ left: 28, top: 24 }}>Tacular</span>
      {eyebrow && <span className="auth-corner-annot" style={{ right: 28, top: 24 }}>{eyebrow}</span>}

      <div className="auth-wrap">
        <div className="auth-card-frame" style={{ maxWidth }}>
          <AuthCorners />
          <div className="auth-wm-standalone">
            <div className="auth-wm-row">
              <img className="auth-wm" src={wordmark} alt="Tacular" />
            </div>
          </div>
          <div className="auth-card-frame-inner">
            <div className="auth-card">{children}</div>
            {footer && <div className="auth-card auth-footer-bento">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthCorners() {
  return (
    <>
      <span className="auth-corner tl"><i /><i /></span>
      <span className="auth-corner tr"><i /><i /></span>
      <span className="auth-corner bl"><i /><i /></span>
      <span className="auth-corner br"><i /><i /></span>
    </>
  );
}

export function AuthField({ label, hint, children }) {
  return (
    <div className="auth-field">
      {label && <label className="auth-field-label">{label}</label>}
      {children}
      {hint && <div className="auth-hint">{hint}</div>}
    </div>
  );
}

export function AuthErrorBanner({ children }) {
  if (!children) return null;
  return (
    <div className="auth-error-banner">
      <span className="dot" />
      <p><span className="lbl">Error</span>{children}</p>
    </div>
  );
}

export function AuthSpinnerLabel({ label }) {
  return (
    <>
      <span className="auth-loading-bar" />
      {label}
    </>
  );
}

export function AuthFooterText({ prompt, linkTo, linkLabel, onClick }) {
  return (
    <span className="auth-footer-tray-text">
      {prompt}{' '}
      {linkTo ? (
        <Link className="auth-link-btn" to={linkTo}>{linkLabel}</Link>
      ) : (
        <button type="button" className="auth-link-btn" onClick={onClick}>{linkLabel}</button>
      )}
    </span>
  );
}
