import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Compass, FileText, Home, Menu, Plus, Trophy, UserRound, X } from 'lucide-react';

const primaryItems = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Explore', path: '/explore', icon: Compass },
  { label: 'Leaderboard', path: '/leaderboard', icon: Trophy },
];

const moreItems = [
  { label: 'Profile', path: '/profile', icon: UserRound },
  { label: 'Docs', path: '/docs', icon: FileText },
];

export const MobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const isMoreActive = location.pathname.startsWith('/profile') || location.pathname.startsWith('/docs');

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const navigateTo = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  const isActive = (path: string) => path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(path) || (path === '/explore' && location.pathname.startsWith('/token'));

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#101012]/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {primaryItems.slice(0, 2).map(({ label, path, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={label}
              type="button"
              onClick={() => navigateTo(path)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors active:bg-white/5 ${
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} />
              <span>{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => navigateTo('/launch')}
          aria-label="Launch a token"
          aria-current={isActive('/launch') ? 'page' : undefined}
          className="mx-auto flex h-12 w-12 -translate-y-1 flex-col items-center justify-center rounded-2xl bg-[#ff2d55] text-white shadow-lg shadow-rose-950/40 transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
          <span className="sr-only">Launch</span>
        </button>

        {primaryItems.slice(2).map(({ label, path, icon: Icon }) => {
          const active = isActive(path);
          return (
            <button
              key={label}
              type="button"
              onClick={() => navigateTo(path)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors active:bg-white/5 ${
                active ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} />
              <span>Leaders</span>
            </button>
          );
        })}

        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label={moreOpen ? 'Close more navigation' : 'More navigation'}
            aria-expanded={moreOpen}
            className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors active:bg-white/5 ${
              isMoreActive || moreOpen ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
            }`}
          >
            {moreOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span>More</span>
          </button>
          {moreOpen && (
            <div className="absolute bottom-[calc(100%+0.75rem)] right-0 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#19191c] p-1.5 shadow-2xl">
              {moreItems.map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigateTo(path)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
