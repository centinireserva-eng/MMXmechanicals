interface LogoMarkProps {
  compact?: boolean;
  className?: string;
}

export default function LogoMark({ compact = false, className = '' }: LogoMarkProps) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`} aria-label="MMX Mechanics">
      <div className="mmx-logo-mark" aria-hidden="true">
        <span>M</span><span>X</span>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-[-0.03em] text-mmx-text">MMX MECHANICS</div>
          <div className="mt-1.5 font-mono text-[8px] uppercase tracking-[0.16em] text-mmx-muted">CFD em tempo real</div>
        </div>
      )}
    </div>
  );
}
