import { Link } from 'react-router-dom';
import { useAuth, useSaves } from '@/hooks';

export function HomePage() {
  const { user, signOut } = useAuth();
  const { currentSave, hasSave, isLoading } = useSaves();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      {/* User info bar */}
      <div className="absolute top-4 right-4 flex items-center gap-4">
        <span className="text-slate-400 text-sm">
          Welcome,{' '}
          <span className="text-pitch-400">{user?.name || user?.email}</span>
        </span>
        <button
          onClick={signOut}
          className="text-slate-400 hover:text-red-400 text-sm transition-colors"
        >
          Sign Out
        </button>
      </div>

      <header className="text-center mb-12">
        <h1 className="font-pixel text-4xl text-pitch-400 mb-4 tracking-wider">
          RETROFOOT
        </h1>
        <p className="text-slate-400 text-lg max-w-md">
          A nostalgic football management experience. Build your dream team,
          manage your club, conquer the league.
        </p>
      </header>

      <nav className="flex flex-col gap-4 w-full max-w-xs">
        {isLoading ? (
          <div className="bg-slate-700 text-slate-400 font-bold py-4 px-8 text-center border-2 border-slate-600">
            Loading...
          </div>
        ) : hasSave ? (
          <>
            {/* User has a save - show Continue button */}
            <Link
              to={`/game/${currentSave?.id}`}
              className="bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-4 px-8 text-center transition-colors border-2 border-pitch-400"
            >
              CONTINUE
            </Link>
            <div className="text-center text-slate-500 text-sm -mt-2 mb-2">
              {currentSave?.name} • {currentSave?.managerName}
            </div>
            <button
              disabled
              className="bg-slate-700 text-slate-500 font-bold py-4 px-8 border-2 border-slate-600 cursor-not-allowed"
              title="Delete current save to start a new game"
            >
              NEW GAME (1 save limit)
            </button>
          </>
        ) : (
          <>
            {/* No save - show New Game button */}
            <Link
              to="/game/new"
              className="bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-4 px-8 text-center transition-colors border-2 border-pitch-400"
            >
              NEW GAME
            </Link>
            <button
              disabled
              className="bg-slate-700 text-slate-500 font-bold py-4 px-8 border-2 border-slate-600 cursor-not-allowed"
            >
              LOAD GAME (No saves)
            </button>
          </>
        )}
        <button
          disabled
          className="bg-slate-700 text-slate-500 font-bold py-4 px-8 border-2 border-slate-600 cursor-not-allowed"
        >
          SETTINGS
        </button>
      </nav>

      <footer className="mt-16 text-slate-500 text-sm">
        <p>Inspired by Elifoot &amp; Brasfoot</p>
      </footer>
    </div>
  );
}
