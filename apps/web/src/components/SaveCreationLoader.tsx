import { useState, useEffect } from 'react';

const LOADING_MESSAGES = [
  'Calibrating VAR to maximum controversy...',
  "Teaching defenders what 'offside' means...",
  "Convincing players Instagram isn't a priority...",
  'Hiding the transfer budget from the owner...',
  'Generating excuses for post-match interviews...',
  'Inflating release clauses to 1 billion...',
  'Promising the board a top 4 finish...',
  'Leaking fake transfer rumours to the press...',
  'Blaming last season on injuries...',
  'Scheduling 47 matches in December...',
  'Registering players before the deadline...',
  'Negotiating agent fees (there goes the budget)...',
  "Preparing 'the referee was against us' speech...",
  'Loading dodgy ownership consortium...',
  'Calculating xG to argue about later...',
  'Renaming the stadium for sponsorship money...',
  "Convincing the physio it's just a knock...",
  'Parking the bus (just in case)...',
  'Oiling the revolving door for managers...',
  'Fabricating chemistry between new signings...',
  'Setting unrealistic expectations...',
  "Polishing the 'Project' PR statement...",
  'Inventing new ways to bottle it...',
];

const MESSAGE_INTERVAL_MS = 3000;
const DEFAULT_ACCENT_COLOR = '#22c55e';
const LIGHT_ACCENT_FALLBACK = '#4ade80';

interface SaveCreationLoaderProps {
  accentColor?: string;
}

function isColorTooDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export function SaveCreationLoader({ accentColor }: SaveCreationLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  const color = accentColor || DEFAULT_ACCENT_COLOR;
  const textColor = isColorTooDark(color) ? LIGHT_ACCENT_FALLBACK : color;

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div
        className="bg-slate-800 border-2 rounded-lg py-8 px-6 w-full max-w-[400px] mx-4"
        style={{ borderColor: color }}
      >
        <div className="flex justify-center mb-6">
          <img
            src="/ball-64.png"
            alt=""
            className="w-16 h-16 animate-bounce"
            style={{
              animationDuration: '0.7s',
              imageRendering: 'pixelated',
              filter: `drop-shadow(0 4px 12px ${color}80)`,
            }}
          />
        </div>

        <div className="h-14 flex items-center justify-center">
          <p
            className="text-base font-medium text-center leading-snug"
            style={{ color: textColor }}
          >
            {LOADING_MESSAGES[messageIndex]}
          </p>
        </div>

        <div className="mt-5 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-[loading-bar_1.8s_ease-in-out_infinite]"
            style={{ backgroundColor: color }}
          />
        </div>

        <style>{`
          @keyframes loading-bar {
            0%, 100% { width: 15%; margin-left: 0; }
            50% { width: 50%; margin-left: 50%; }
          }
        `}</style>
      </div>
    </div>
  );
}
