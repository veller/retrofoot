import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
      <header className="text-center mb-12">
        <h1 className="font-pixel text-4xl text-pitch-400 mb-4 tracking-wider">
          RETROFOOT
        </h1>
        <p className="text-slate-400 text-lg max-w-md">
          A nostalgic football management experience.
          Build your dream team, manage your club, conquer the league.
        </p>
      </header>

      <nav className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          to="/game"
          className="bg-pitch-600 hover:bg-pitch-500 text-white font-bold py-4 px-8 text-center transition-colors border-2 border-pitch-400"
        >
          NEW GAME
        </Link>
        <button
          disabled
          className="bg-slate-700 text-slate-500 font-bold py-4 px-8 border-2 border-slate-600 cursor-not-allowed"
        >
          LOAD GAME (Coming Soon)
        </button>
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
  )
}
