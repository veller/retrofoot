import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useSaves } from '@/hooks';

export function HomePage() {
  const { user, signOut } = useAuth();
  const { currentSave, hasSave, isLoading, deleteSave, isDeleting } =
    useSaves();
  const navigate = useNavigate();
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleNewGameClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmNewGame = async () => {
    if (currentSave) {
      const deleted = await deleteSave(currentSave.id);
      if (deleted) {
        navigate('/game/new');
      }
    }
    setShowConfirmModal(false);
  };

  const handleCancelNewGame = () => {
    setShowConfirmModal(false);
  };

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
              onClick={handleNewGameClick}
              className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-bold py-4 px-8 border-2 border-slate-500 hover:border-slate-400 transition-colors"
            >
              NEW GAME
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

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-800 border-2 border-slate-600 p-6 max-w-md mx-4">
            <h2 className="font-pixel text-xl text-red-400 mb-4">
              START NEW GAME?
            </h2>
            <p className="text-slate-300 mb-2">
              This will{' '}
              <span className="text-red-400 font-bold">permanently delete</span>{' '}
              your current save:
            </p>
            <div className="bg-slate-900 border border-slate-700 p-3 mb-4">
              <p className="text-pitch-400 font-bold">{currentSave?.name}</p>
              <p className="text-slate-400 text-sm">
                Manager: {currentSave?.managerName}
              </p>
              <p className="text-slate-500 text-sm">
                Season {currentSave?.currentSeason} • Round{' '}
                {currentSave?.currentRound}
              </p>
            </div>
            <p className="text-slate-400 text-sm mb-6">
              All progress will be lost. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelNewGame}
                disabled={isDeleting}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 border-2 border-slate-500 transition-colors disabled:opacity-50"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmNewGame}
                disabled={isDeleting}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-4 border-2 border-red-500 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'DELETING...' : 'DELETE & START NEW'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
