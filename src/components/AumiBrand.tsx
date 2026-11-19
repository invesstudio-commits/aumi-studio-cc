import React from 'react';

export function AumiLogoMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M18 3.5C19.6 3.5 20.8 4.9 20.6 6.6L19.9 13.4L25.5 9.4C26.9 8.4 28.8 8.8 29.7 10.2C30.6 11.6 30.1 13.5 28.7 14.4L22.5 17.8L28.7 21.2C30.1 22.1 30.6 24 29.7 25.4C28.8 26.8 26.9 27.2 25.5 26.2L19.9 22.2L20.6 29C20.8 30.7 19.6 32.1 18 32.1C16.4 32.1 15.2 30.7 15.4 29L16.1 22.2L10.5 26.2C9.1 27.2 7.2 26.8 6.3 25.4C5.4 24 5.9 22.1 7.3 21.2L13.5 17.8L7.3 14.4C5.9 13.5 5.4 11.6 6.3 10.2C7.2 8.8 9.1 8.4 10.5 9.4L16.1 13.4L15.4 6.6C15.2 4.9 16.4 3.5 18 3.5Z"
        fill="#E1754C"
      />
    </svg>
  );
}

export function AumiWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2 select-none whitespace-nowrap shrink-0">
      <AumiLogoMark size={compact ? 22 : 24} />
      {!compact && (
        <span className="text-[18px] leading-none text-[#2F1534] tracking-tight">
          <span className="font-milligram font-semibold">Aumi</span>{' '}
          <span className="font-editorial font-normal">Studio</span>
        </span>
      )}
    </div>
  );
}

export function PartnerAvatar({
  name,
  partnerKey,
  avatarUrl,
  size = 'md',
  isOnline,
}: {
  name: string;
  partnerKey?: string | null;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
}) {
  const sizes = {
    xs: 'w-6 h-6 text-[11px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-14 h-14 text-lg',
  };

  const isIngrid = partnerKey === 'ingrid' || name.toLowerCase().includes('ingrid');
  const isMariana = partnerKey === 'mariana' || name.toLowerCase().includes('mariana');

  const bgClass = isIngrid
    ? 'bg-gradient-to-br from-[#FDF2F6] to-[#F9D6E5] text-[#EC2B82] border-[#EC97B7]/50'
    : isMariana
    ? 'bg-gradient-to-br from-[#F3ECF9] to-[#E3D3F7] text-[#7A689C] border-[#BC9FE6]/60'
    : 'bg-gradient-to-br from-[#FDF0E8] to-[#F9DEC9] text-[#E1754C] border-[#E1754C]/40';

  return (
    <span className="relative inline-flex shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          referrerPolicy="no-referrer"
          className={`${sizes[size]} rounded-full object-cover border border-white/80 shadow-sm shrink-0`}
        />
      ) : (
        <span
          className={`${sizes[size]} ${bgClass} rounded-full border inline-flex items-center justify-center font-semibold shadow-sm shrink-0`}
          title={name}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      {isOnline !== undefined && (
        <span
          title={isOnline ? 'Conectada agora' : 'Ausente'}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
            isOnline ? 'bg-[#C8C978] shadow-[0_0_6px_rgba(200,201,120,0.9)]' : 'bg-[#232122]/25'
          }`}
        />
      )}
    </span>
  );
}

/**
 * Translucent Liquid Glass Finder-style folder inspired by the Pink Glass Folder aesthetic.
 */
export function GlassFolderGraphic({
  color = '#EC97B7',
  size = 64,
  badgeText,
  avatarUrl,
  initials,
}: {
  color?: string;
  size?: number;
  badgeText?: string;
  avatarUrl?: string | null;
  initials?: string;
}) {
  const safeColor = color || '#EC97B7';
  const uid = React.useId().replace(/:/g, '');
  return (
    <div
      className="relative inline-flex items-center justify-center select-none shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5"
      style={{ width: size, height: Math.round(size * 0.84) }}
    >
      <svg
        width={size}
        height={Math.round(size * 0.84)}
        viewBox="0 0 96 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-[0_10px_18px_rgba(47,21,52,0.16)]"
      >
        <defs>
          <linearGradient id={`back-${uid}`} x1="0" y1="0" x2="96" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={safeColor} stopOpacity="0.92" />
            <stop offset="100%" stopColor={safeColor} stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id={`front-${uid}`} x1="12" y1="18" x2="88" y2="78" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.72" />
            <stop offset="35%" stopColor={safeColor} stopOpacity="0.58" />
            <stop offset="100%" stopColor={safeColor} stopOpacity="0.88" />
          </linearGradient>
        </defs>
        {/* Back Folder Plate */}
        <rect x="6" y="4" width="84" height="68" rx="14" fill={`url(#back-${uid})`} stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" />
        {/* Inner Translucent Sheets */}
        <rect x="15" y="10" width="44" height="36" rx="6" transform="rotate(-7 15 10)" fill="rgba(255,255,255,0.88)" />
        <rect x="34" y="9" width="38" height="34" rx="6" transform="rotate(2 34 9)" fill="rgba(255,255,255,0.72)" />
        <line x1="21" y1="18" x2="47" y2="15" stroke={safeColor} strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
        <line x1="22" y1="25" x2="42" y2="23" stroke={safeColor} strokeOpacity="0.28" strokeWidth="2.5" strokeLinecap="round" />
        {/* Front Liquid Glass Pocket with Finder tab */}
        <path
          d="M2 24C2 19.5817 5.58172 16 10 16H40.5C43.2 16 45.7 17.3 47.2 19.5L49.5 22.8C50.7 24.5 52.6 25.5 54.7 25.5H86C90.4183 25.5 94 29.0817 94 33.5V66C94 71.5228 89.5228 76 84 76H12C6.47715 76 2 71.5228 2 66V24Z"
          fill={`url(#front-${uid})`}
          stroke="rgba(255,255,255,0.86)"
          strokeWidth="1.5"
        />
        {/* Specular top rim */}
        <path
          d="M9 17.5H40C42 17.5 44 18.5 45.3 20.2L48 24C49.5 26 51.8 27 54.4 27H86"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>

      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute bottom-1.5 right-1 w-6 h-6 rounded-full object-cover border-2 border-white shadow-sm"
        />
      ) : initials ? (
        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-white/85 backdrop-blur-sm text-[10px] font-semibold text-[#2F1534] border border-white shadow-xs">
          {initials}
        </span>
      ) : null}

      {badgeText && (
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-[#2F1534] text-white text-[10px] font-semibold shadow-sm tabular-nums">
          {badgeText}
        </span>
      )}
    </div>
  );
}
