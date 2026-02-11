import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUp, useSession } from '@/lib/auth';
import { SeoHead } from '@/components';

export function RegisterPage() {
  const navigate = useNavigate();
  const session = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password length
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      const { error: signUpError } = await signUp.email({
        name,
        email,
        password,
      });

      if (signUpError) {
        setError(
          signUpError.message || 'Registration failed. Please try again.',
        );
        setLoading(false);
      } else {
        // Refetch session to update the reactive state before navigating
        await session.refetch();
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      console.error('Registration error:', err);
      setLoading(false);
    }
  };

  return (
    <>
      <SeoHead
        title="Create Account | RetroFoot"
        description="Create your RetroFoot manager account and start your football career."
        path="/register"
      />
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-md">
          <header className="text-center mb-8">
            <Link to="/" className="inline-block">
              <h1 className="font-pixel text-3xl text-pitch-400 tracking-wider hover:text-pitch-300 transition-colors">
                RETROFOOT
              </h1>
            </Link>
            <p className="text-slate-400 mt-4">Create your manager account</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-slate-300 mb-2">
                Manager Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className="w-full bg-slate-800 border-2 border-slate-600 text-white px-4 py-3 focus:border-pitch-400 focus:outline-none transition-colors"
                placeholder="Jose Mourinho"
              />
            </div>

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
                autoComplete="new-password"
                minLength={8}
                className="w-full bg-slate-800 border-2 border-slate-600 text-white px-4 py-3 focus:border-pitch-400 focus:outline-none transition-colors"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-slate-300 mb-2"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-slate-800 border-2 border-slate-600 text-white px-4 py-3 focus:border-pitch-400 focus:outline-none transition-colors"
                placeholder="Repeat password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-pitch-600 hover:bg-pitch-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 px-8 transition-colors border-2 border-pitch-400 disabled:border-slate-600"
            >
              {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-pitch-400 hover:text-pitch-300 transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
