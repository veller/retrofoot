interface RetrofootLogoProps {
  size?: 'sm' | 'lg';
  className?: string;
}

export function RetrofootLogo({
  size = 'sm',
  className = '',
}: RetrofootLogoProps) {
  const sizeClass = size === 'lg' ? 'text-2xl md:text-3xl' : 'text-sm';

  return (
    <span
      className={`font-pixel tracking-wider text-pitch-400 retrofoot-logo-shiny ${sizeClass} ${className}`.trim()}
    >
      RETROFOOT
    </span>
  );
}
