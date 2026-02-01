import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signInAndRefresh } from '@/lib/auth';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Get the page user was trying to access before being redirected to login
  const from =
    (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await signInAndRefresh({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || 'Login failed. Please try again.');
        setLoading(false);
      } else {
        // Session is now refreshed, safe to navigate
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Login error:', err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <Link to="/" className="inline-block">
            <h1 className="font-pixel text-3xl text-pitch-400 tracking-wider hover:text-pitch-300 transition-colors">
              RETROFOOT
            </h1>
          </Link>
          <p className="text-slate-400 mt-4">Sign in to continue</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-slate-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-slate-800 border-2 border-slate-600 text-white px-4 py-3 focus:border-pitch-400 focus:outline-none transition-colors"
              placeholder="manager@retrofoot.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-slate-300 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-slate-800 border-2 border-slate-600 text-white px-4 py-3 focus:border-pitch-400 focus:outline-none transition-colors"
              placeholder="********"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-pitch-600 hover:bg-pitch-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 px-8 transition-colors border-2 border-pitch-400 disabled:border-slate-600"
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-slate-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-pitch-400 hover:text-pitch-300 transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
