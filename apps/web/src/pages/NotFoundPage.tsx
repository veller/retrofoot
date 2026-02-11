import { Link } from 'react-router-dom';
import { SeoHead } from '@/components';

export function NotFoundPage() {
  return (
    <>
      <SeoHead
        title="Page Not Found | RetroFoot"
        description="The page you requested could not be found."
        noindex
      />
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
        <h1 className="font-pixel text-6xl text-pitch-400 mb-4">404</h1>
        <p className="text-slate-400 text-xl mb-8">Page not found</p>
        <Link
          to="/"
          className="bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-3 px-6 transition-colors border-2 border-pitch-400"
        >
          BACK TO HOME
        </Link>
      </div>
    </>
  );
}
