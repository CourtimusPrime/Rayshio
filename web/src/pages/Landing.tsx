import { Link } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { Wordmark } from '../components/Wordmark';
import { GoogleButton } from '../marketing/GoogleButton';
import { HeroPreview } from '../marketing/HeroPreview';
import { Reveal } from '../marketing/Reveal';
import { CLOSING, FEATURES, FOOTER, HERO, HOW_IT_WORKS, PRODUCT_NAME } from '../marketing/copy';
import { useScrollEdge } from '../utils/useScrollEdge';

/**
 * The public front door, at `/`.
 *
 * `/` is polymorphic rather than the app moving to `/app`: signed out it is
 * this page, signed in it is the dashboard. A crawler is always signed out, so
 * `/` is the marketing page for exactly the audience that needs one — and no
 * NavLink, title or existing bookmark had to change to arrange it.
 *
 * Every section reuses a recipe the app already has: the padded card, the
 * micro-label, and `.material-chrome` for the sticky header.
 */
export function Landing() {
  const { sentinel, atTop } = useScrollEdge();

  return (
    <div className="flex min-h-full w-full flex-col bg-canvas">
      <div ref={sentinel} aria-hidden="true" className="-mb-px h-px shrink-0" />

      <header
        data-scrolled={!atTop}
        className="material-chrome sticky top-0 z-chrome flex items-center gap-4 px-5 py-3.5 md:px-8"
      >
        <Link to="/" aria-label={`${PRODUCT_NAME} home`}>
          <Wordmark />
        </Link>
        <Link
          to="/signin"
          className="press ml-auto flex h-9 items-center rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Sign in
        </Link>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
          <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <Reveal>
              <p className="text-micro font-medium uppercase tracking-wide text-accent-strong">
                {HERO.eyebrow}
              </p>
              <h1 className="mt-3 text-hero font-semibold text-ink-900 md:text-hero-lg">
                {HERO.headline}
              </h1>
              <p className="mt-5 max-w-xl text-lede text-ink-500">{HERO.lede}</p>
              <div className="mt-8">
                <GoogleButton label={HERO.cta} />
                <p className="mt-3 text-caption text-ink-400">{HERO.ctaNote}</p>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <HeroPreview />
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 md:px-8 md:pb-24">
          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((feature, i) => (
              <Reveal
                key={feature.title}
                delay={i * 0.04}
                /* the last card spans both columns rather than leaving a hole
                   in an odd-numbered grid */
                className={i === FEATURES.length - 1 ? 'md:col-span-2' : undefined}
              >
                <article className="h-full rounded-xl border border-line bg-surface p-6 shadow-e1 transition-shadow duration-200 ease-apple hover:shadow-e2">
                  <h2 className="text-title3 font-semibold text-ink-900">{feature.title}</h2>
                  <p className="mt-2.5 text-body text-ink-500">{feature.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-line bg-surface py-16 md:py-24">
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <Reveal>
              <h2 className="text-title1 font-semibold text-ink-900">{HOW_IT_WORKS.title}</h2>
            </Reveal>
            <ol className="mt-8 grid gap-6 md:grid-cols-3 md:gap-8">
              {HOW_IT_WORKS.steps.map((step, i) => (
                <Reveal key={step.title} delay={i * 0.06}>
                  <li className="list-none">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-footnote font-semibold text-accent-strong">
                      {i + 1}
                    </span>
                    <h3 className="mt-4 text-subhead font-semibold text-ink-900">{step.title}</h3>
                    <p className="mt-2 text-body text-ink-500">{step.body}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-e1 md:p-12">
              <h2 className="text-title1 font-semibold text-ink-900 md:text-display">
                {CLOSING.title}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-body text-ink-500">{CLOSING.body}</p>
              <GoogleButton label={CLOSING.cta} className="mt-7" />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-8 md:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:flex-row md:items-center">
          <div>
            <Wordmark />
            <p className="mt-2 text-caption text-ink-400">{FOOTER.tagline}</p>
          </div>
          <nav className="flex items-center gap-5 md:ml-auto" aria-label="Legal">
            <Link to="/privacy" className="text-footnote text-ink-500 hover:text-ink-900">
              {FOOTER.privacy}
            </Link>
            <Link to="/terms" className="text-footnote text-ink-500 hover:text-ink-900">
              {FOOTER.terms}
            </Link>
          </nav>
          {/* ThemeProvider sits above the router, so this needs no changes to
              work on a page outside the authenticated shell */}
          <div className="w-40 md:ml-4">
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
