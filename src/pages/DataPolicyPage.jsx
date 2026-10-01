import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AuthShell from '../components/auth/AuthShell';

/**
 * DataPolicyPage
 *
 * Public privacy & data policy, rendered in the shared AuthShell chrome.
 * Static content only — no storage or routing dependencies. Reachable by
 * anyone (not wrapped in PublicRoute) so signed-in users can read it too.
 */
export default function DataPolicyPage() {
  const navigate = useNavigate();
  // Go back if there is in-app history to go back to, otherwise land on
  // /login (direct visits and fresh tabs have no useful history entry).
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/login');
    }
  };
  return (
    <AuthShell
      eyebrow="Legal · Data Policy"
      maxWidth={840}
      footer={(
        <>
          <button type="button" className="auth-btn-secondary auth-policy-back" style={{ marginBottom: 10 }} onClick={handleBack}>
            <ArrowLeft size={16} />
            Back
          </button>
          <span className="auth-footer-tray-text" style={{ display: 'block' }}>
            Questions about your data?{' '}
            <a className="auth-link-btn" href="mailto:hello@tacular.app">hello@tacular.app</a>
          </span>
        </>
      )}
    >
      <div className="auth-policy">
        <button type="button" className="auth-btn-secondary auth-policy-back" onClick={handleBack}>
          <ArrowLeft size={16} />
          Back
        </button>
        <h1>Privacy &amp; Data Policy</h1>
        <p className="auth-policy-updated">Last updated: 1 October 2026</p>

        <h2>Who we are</h2>
        <p>
          Tacular is operated by Studio PDW Ltd, a company registered in the United Kingdom.
          Studio PDW Ltd is the data controller for the personal data described in this policy
          and is registered with the Information Commissioner&rsquo;s Office (ICO).
        </p>
        <p>
          If you have any questions about this policy or your data, contact us at{' '}
          <a href="mailto:hello@tacular.app">hello@tacular.app</a>.
        </p>

        <h2>What we collect</h2>
        <p>We collect only what the service needs to work:</p>
        <ul>
          <li><strong>Your email address</strong> — used to create and secure your account and to send you service-related messages.</li>
          <li><strong>Your planning content</strong> — the goals, plans, tasks and notes you create in Tacular.</li>
          <li><strong>Basic technical data</strong> — standard server logs (such as IP address and browser type) generated when you use the service, kept for security and troubleshooting.</li>
        </ul>
        <p>
          We do not use analytics or advertising trackers. If this changes, we will update this
          policy and tell you before anything new is introduced.
        </p>

        <h2>How your planning content is protected</h2>
        <p>
          Your goals and plans are personal. Tacular encrypts your planning content before it is
          stored, using encryption keys managed by us and held separately from the database. This means:
        </p>
        <ul>
          <li>Your content is encrypted at rest and cannot be read by our database or hosting providers.</li>
          <li>We do not read your planning content in the ordinary course of running the service.</li>
          <li>Because we manage the keys, limited access by us remains technically possible. We would only use it where strictly necessary — for example to resolve a support issue at your request, or to meet a legal obligation — and never for any other purpose.</li>
        </ul>

        <h2>Why we process your data</h2>
        <p>Under UK data protection law, our lawful bases are:</p>
        <ul>
          <li><strong>Contract</strong> — we process your email address and planning content to provide the service you signed up for.</li>
          <li><strong>Legitimate interests</strong> — we process technical logs to keep the service secure and working, and limited account information to improve the product.</li>
        </ul>

        <h2>Emails we send</h2>
        <p>
          We only send emails connected to the service: account messages (such as sign-in and
          security emails) and, if you enable them, task and planning reminders. You can turn
          reminders off at any time. We do not send marketing emails.
        </p>

        <h2>Where your data is stored and who processes it</h2>
        <p>We use a small number of established providers to run Tacular:</p>
        <ul>
          <li><strong>Supabase</strong> — our database and authentication provider. Your data is stored in Supabase&rsquo;s Paris (EU) region.</li>
          <li><strong>Vercel</strong> — hosts the Tacular website and application.</li>
        </ul>
        <p>
          Your data is stored in the UK/EU. Where any processing touches infrastructure outside
          the UK, it is covered by UK adequacy regulations or equivalent safeguards. We do not
          sell your data, and we do not share it with anyone else.
        </p>

        <h2>How long we keep your data</h2>
        <ul>
          <li>If you delete your account, your personal data is deleted within 30 days.</li>
          <li>Account content you delete inside the app is removed from our systems within 30 days.</li>
        </ul>

        <h2>Age</h2>
        <p>
          Tacular is for users aged 18 and over. We do not knowingly collect data from anyone
          under 18, and sign-up is restricted accordingly.
        </p>

        <h2>Your rights</h2>
        <p>Under UK GDPR you have the right to:</p>
        <ul>
          <li>access a copy of your personal data</li>
          <li>correct inaccurate data</li>
          <li>delete your data</li>
          <li>receive your data in a portable format</li>
          <li>object to or restrict certain processing</li>
        </ul>
        <p>
          To exercise any of these, email <a href="mailto:hello@tacular.app">hello@tacular.app</a>.
          You also have the right to complain to the ICO at{' '}
          <a href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a>.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we make material changes to this policy, we will update the date above and notify
          account holders by email.
        </p>
      </div>
    </AuthShell>
  );
}
