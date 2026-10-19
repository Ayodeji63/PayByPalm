/** Public welcome page. All checkout values below are explicitly illustrative. */
import { Link } from "react-router-dom";
import { PalmIcon, Wordmark } from "../components/ui.js";
import "./Landing.css";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="welcome-page">
      <a className="welcome-skip" href="#welcome-content">
        Skip to content
      </a>
      <header className="welcome-header welcome-width">
        <Link to="/" className="welcome-brand" aria-label="PayByPalm home">
          <span className="welcome-brand-icon">
            <PalmIcon />
          </span>
          <Wordmark />
        </Link>
        <nav aria-label="Welcome navigation">
          <a className="welcome-how-link" href="#how-it-works">
            How it works
          </a>
          <Link
            to="/login"
            state={{ mode: "signin" }}
            className="welcome-signin"
          >
            Sign in <Arrow />
          </Link>
        </nav>
      </header>

      <main id="welcome-content" tabIndex={-1}>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-width welcome-hero-layout">
            <div className="welcome-intro">
              <h1 id="welcome-title">
                Your palm.
                <br />
                <span>
                  Your way
                  <br className="welcome-desktop-break" /> to pay.
                </span>
              </h1>
              <p>
                Link your card. Enrol your palm. Pay at a PayByPalm terminal
                with a simple scan.
              </p>
              <Link
                to="/login"
                state={{ mode: "signup" }}
                className="welcome-primary"
              >
                Create your account <Arrow />
              </Link>
              <a className="welcome-hero-link" href="#how-it-works">
                See how it works{" "}
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 5v14m-6-6 6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>

            <figure className="welcome-checkout">
              <figcaption>
                At a PayByPalm checkout <span>Illustration</span>
              </figcaption>
              <div className="welcome-palm-visual">
                <img
                  src="/images/hero-palm.jpg"
                  alt="An open human palm with visible natural lines, held up for a palm scan"
                  width={800}
                  height={1422}
                  fetchPriority="high"
                  decoding="async"
                  className="welcome-palm-photo"
                />
                <div className="welcome-photo-checkout">
                  <div>
                    <p className="welcome-amount-label">Example amount</p>
                    <p className="welcome-amount">
                      ₦2,500<span>.00</span>
                    </p>
                  </div>
                  <div className="welcome-photo-instruction">
                    <p>Present your palm</p>
                    <span>Pay with your linked card</span>
                  </div>
                </div>
              </div>
              <p className="welcome-example-note">
                Example checkout. No payment is being made.
              </p>
            </figure>
          </div>
        </section>

        <section
          className="welcome-setup welcome-width"
          id="how-it-works"
          aria-labelledby="welcome-setup-title"
        >
          <div className="welcome-section-heading">
            <h2 id="welcome-setup-title">
              Set up once.
              <br />
              Take it from there.
            </h2>
            <p>
              A little setup on your phone.
              <br />A simpler way to pay at the counter.
            </p>
          </div>
          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-number">1</span>
              <h3>Create your account</h3>
              <p>Sign up and verify your email using the link in your inbox.</p>
            </li>
            <li>
              <span className="welcome-step-number">2</span>
              <h3>Link a payment card</h3>
              <p>
                Add your card through Paystack’s checkout and choose it for your
                payments.
              </p>
            </li>
            <li>
              <span className="welcome-step-number">3</span>
              <h3>Enrol your palm</h3>
              <p>
                Use a PayByPalm terminal to link your palm with your consent.
                Then you’re ready to scan and pay.
              </p>
            </li>
          </ol>
        </section>

        <section
          className="welcome-control welcome-width"
          aria-labelledby="welcome-control-title"
        >
          <div>
            <h2 id="welcome-control-title">
              Your card.
              <br />
              You’re in control.
            </h2>
            <p>
              Payments are charged to your linked card. Manage your cards,
              review your activity, and unlink your palm from your account.
              Check your available funds in your bank app.
            </p>
          </div>
          <Link
            to="/login"
            state={{ mode: "signup" }}
            className="welcome-secondary"
          >
            Get started <Arrow />
          </Link>
        </section>
      </main>

      <footer className="welcome-footer welcome-width">
        <Wordmark />
        <p>Payments, a little more personal.</p>
        <Link to="/login" state={{ mode: "signin" }}>
          Already have an account? <span>Sign in</span>
        </Link>
      </footer>
    </div>
  );
}
