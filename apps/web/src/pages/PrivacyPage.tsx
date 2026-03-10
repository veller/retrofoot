import { Link } from 'react-router-dom';
import { SeoHead } from '@/components';

export function PrivacyPage() {
  return (
    <>
      <SeoHead
        title="Privacy Policy | RetroFoot"
        description="How RetroFoot collects, uses, and protects your data."
        path="/privacy"
      />
      <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
            <p className="text-slate-400">Last updated: February 13, 2026</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">What we collect</h2>
            <p>
              We collect account details you provide (email and manager name),
              gameplay progress, and basic usage analytics needed to improve the
              game.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">How we use data</h2>
            <p>
              Data is used to run your save, secure access, debug issues, and
              understand whether the game is improving through core gameplay
              metrics.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Sharing</h2>
            <p>
              We do not sell personal data. We only use infrastructure and
              analytics providers needed to operate the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p>
              For privacy requests, contact us via the Contact page.
            </p>
          </section>

          <Link to="/" className="inline-block text-pitch-400 hover:text-pitch-300">
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
