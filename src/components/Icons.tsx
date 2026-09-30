import React from 'react';

export const TwitchIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);

export const TwitchBitsIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L4 9l3 13h10l3-13-8-7zm0 3.2L16.8 9 15 19.5H9L7.2 9 12 5.2z" />
  </svg>
);

export const XTwitterIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const RobinhoodIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    {/* Iconic Robinhood Feather Icon */}
    <path d="M17.5 1.5C12.8 1.5 9 5.3 9 10c0 1.2.3 2.4.8 3.4L3.2 20c-.3.3-.3.8 0 1.1.3.3.8.3 1.1 0l6.6-6.6c1 .5 2.2.8 3.4.8 4.7 0 8.5-3.8 8.5-8.5 0-2.9-1.5-5.3-3.8-5.3h-1.5zm-.5 3c2.5 0 4.5 2 4.5 4.5s-2 4.5-4.5 4.5c-1.3 0-2.5-.5-3.4-1.4l5.3-5.3c-.6-.8-1.5-1.3-2.6-1.3-.4 0-.8.1-1.2.2.4-.7 1.1-1.2 1.9-1.2z" />
  </svg>
);

