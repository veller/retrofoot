import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateSave, useSaves } from '@/hooks';

interface TeamOption {
  id: string;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  reputation: number;
}

export function NewGamePage() {
  const navigate = useNavigate();
  const { hasSave } = useSaves();
  const { createSave, isCreating, error } = useCreateSave();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [managerName, setManagerName] = useState('');
  const [saveName, setSaveName] = useState('My Career');

  // Redirect if user already has a save
  useEffect(() => {
    if (hasSave) {
      navigate('/');
    }
  }, [hasSave, navigate]);

  // Fetch available teams
  useEffect(() => {
    async function fetchTeams() {
      try {
        const response = await fetch('/api/save/teams');
        if (response.ok) {
          const data = await response.json();
          setTeams(data.teams || []);
        }
      } catch (err) {
        console.error('Failed to fetch teams:', err);
      } finally {
        setIsLoadingTeams(false);
      }
    }
    fetchTeams();
  }, []);

  const handleCreateGame = async () => {
    if (!selectedTeam || !managerName.trim()) return;

    const result = await createSave({
      name: saveName,
      teamId: selectedTeam,
      managerName: managerName.trim(),
    });

    if (result) {
      navigate(`/game/${result.saveId}`);
    }
  };

  const selectedTeamData = teams.find((t) => t.id === selectedTeam);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <Link to="/" className="text-slate-400 hover:text-white">
            &larr; Back
          </Link>
          <h1 className="font-pixel text-xl text-pitch-400">NEW GAME</h1>
          <div className="w-16" /> {/* Spacer */}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Manager Name */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">Manager Name</h2>
            <input
              type="text"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="Enter your name..."
              className="w-full max-w-md bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded focus:outline-none focus:border-pitch-400"
            />
          </section>

          {/* Save Name */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">Save Name</h2>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="My Career"
              className="w-full max-w-md bg-slate-800 border border-slate-600 text-white px-4 py-3 rounded focus:outline-none focus:border-pitch-400"
            />
          </section>

          {/* Team Selection */}
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-3">
              Select Your Club
            </h2>
            {isLoadingTeams ? (
              <p className="text-slate-400">Loading teams...</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeam(team.id)}
                    className={`p-4 rounded border-2 transition-all ${
                      selectedTeam === team.id
                        ? 'border-pitch-400 bg-pitch-900/30'
                        : 'border-slate-600 bg-slate-800 hover:border-slate-500'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full mx-auto mb-2"
                      style={{ backgroundColor: team.primaryColor }}
                    />
                    <p className="text-white font-medium text-sm truncate">
                      {team.name}
                    </p>
                    <p className="text-slate-400 text-xs">
                      Rep: {team.reputation}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Selected Team Info */}
          {selectedTeamData && (
            <section className="mb-8 bg-slate-800 border border-slate-600 p-4 rounded">
              <h3 className="text-white font-bold mb-2">
                {selectedTeamData.name}
              </h3>
              <p className="text-slate-400 text-sm">
                Reputation: {selectedTeamData.reputation}/100
              </p>
              <p className="text-slate-500 text-xs mt-1">
                Higher reputation means better starting players and budget.
              </p>
            </section>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded text-red-400">
              {error}
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreateGame}
            disabled={!selectedTeam || !managerName.trim() || isCreating}
            className={`w-full max-w-md py-4 px-8 font-bold text-lg transition-colors ${
              !selectedTeam || !managerName.trim() || isCreating
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-pitch-600 hover:bg-pitch-500 text-white'
            }`}
          >
            {isCreating ? 'CREATING GAME...' : 'START CAREER'}
          </button>
        </div>
      </main>
    </div>
  );
}
