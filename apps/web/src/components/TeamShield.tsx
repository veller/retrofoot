interface TeamShieldProps {
  team: {
    shortName: string;
    primaryColor: string;
    secondaryColor: string;
    badgeUrl?: string;
  };
}

export function TeamShield({ team }: TeamShieldProps) {
  return (
    <div className="w-8 h-8 shrink-0 flex items-center justify-center pixel-art">
      {team.badgeUrl ? (
        <img
          src={team.badgeUrl}
          alt={team.shortName}
          className="w-full h-full object-contain"
        />
      ) : (
        <svg viewBox="0 0 40 48" className="w-8 h-10">
          <path
            d="M20 2 L36 8 L36 24 Q36 36 20 46 Q4 36 4 24 L4 8 Z"
            fill={team.primaryColor}
            stroke={team.secondaryColor}
            strokeWidth="1"
          />
          <text
            x="20"
            y="26"
            textAnchor="middle"
            fill={team.secondaryColor}
            fontSize="10"
            fontWeight="bold"
            fontFamily="monospace"
          >
            {team.shortName}
          </text>
        </svg>
      )}
    </div>
  );
}
