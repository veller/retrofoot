import { Link } from 'react-router-dom';
import { SeoHead } from '@/components';

export function ContactPage() {
  return (
    <>
      <SeoHead
        title="Contact | RetroFoot"
        description="Contact the RetroFoot team."
        path="/contact"
      />
      <div className="min-h-screen bg-slate-900 text-slate-200 px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Contact</h1>
            <p className="text-slate-400">Questions, bugs, or feedback.</p>
          </header>

          {/* 
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Email</h2>
            <p>
              Reach us at{' '}
              <a
                className="text-pitch-400 hover:text-pitch-300"
                href="mailto:hello@retrofoot.app"
              >
                hello@retrofoot.app
              </a>
              .
            </p>
          </section> */}

          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">Response time</h2>
            <p>We usually reply within 2-3 business days.</p>
          </section>

          <Link
            to="/"
            className="inline-block text-pitch-400 hover:text-pitch-300"
          >
            Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
