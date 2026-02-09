/**
 * Pixel-art form status badge: HOT or COLD.
 * Roguelike / Balatro vibe: chunky pixels, CRT/arcade, bold and readable.
 */

import { useEffect, useRef, useState } from 'react';

export type FormStatus = 'hot' | 'cold';

interface FormStatusBadgeProps {
  status: FormStatus;
  title?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function FormStatusBadge({
  status,
  title,
  size = 'sm',
  className = '',
}: FormStatusBadgeProps) {
  const label = status === 'hot' ? 'HOT' : 'COLD';
  const prevStatus = useRef<FormStatus>(status);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 220);
      return () => clearTimeout(t);
    }
  }, [status]);

  return (
    <span
      role="status"
      aria-label={`Form: ${label}`}
      title={title}
      data-status={status}
      data-size={size}
      data-flash={flashing ? 'true' : undefined}
      className={`form-status-badge inline-flex items-center justify-center font-bold tracking-wider transition-colors duration-300 ${className}`}
    >
      <span className="form-status-badge__bg" aria-hidden />
      <span className="form-status-badge__flames" aria-hidden />
      <span className="form-status-badge__frost" aria-hidden />
      <span className="form-status-badge__text">{label}</span>
    </span>
  );
}
