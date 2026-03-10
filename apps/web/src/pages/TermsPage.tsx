import { Link } from 'react-router-dom';
import { SeoHead } from '@/components';

export function TermsPage() {
  return (
    <>
      <SeoHead
        title="Terms of Service | RetroFoot"
        description="Rules and terms for using RetroFoot."
        path="/terms"
      />
      <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
            <p className="text-slate-400">Last updated: February 13, 2026</p>
          </header>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Use of the service</h2>
            <p>
              RetroFoot is provided as an online game service. You agree not to
              abuse, disrupt, or attempt unauthorized access to accounts or
              infrastructure.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Accounts</h2>
            <p>
              You are responsible for maintaining the security of your account and
              password.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Availability</h2>
            <p>
              We may update, suspend, or discontinue parts of the game at any
              time, including for maintenance or balancing changes.
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
