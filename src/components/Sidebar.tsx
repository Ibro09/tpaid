import React from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { 
  Home, 
  Compass, 
  Trophy, 
  Zap, 
  FileText, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { NavTab } from '../types';
import { TwitchIcon, XTwitterIcon } from './Icons';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTab = (): NavTab => {
    const path = location.pathname;
    if (path === '/' || path === '/home') return 'home';
    if (path.startsWith('/explore') || path.startsWith('/token')) return 'explore';
    if (path.startsWith('/leaderboard')) return 'leaderboard';
    if (path.startsWith('/launch')) return 'launch';
    if (path.startsWith('/docs')) return 'docs';
    return 'home';
  };

  const currentTab = getActiveTab();

  const navItems: { id: NavTab; path: string; label: string; icon: React.ReactNode; isAction?: boolean }[] = [
    { id: 'home', path: '/', label: 'Home', icon: <Home className="w-4 h-4" /> },
    { id: 'explore', path: '/explore', label: 'Explore', icon: <Compass className="w-4 h-4" /> },
    { id: 'leaderboard', path: '/leaderboard', label: 'Leaderboard', icon: <Trophy className="w-4 h-4" /> },
    { id: 'launch', path: '/launch', label: 'Launch', icon: <Zap className="w-4 h-4" />, isAction: true },
    { id: 'docs', path: '/docs', label: 'Docs', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <aside
      className={`hidden md:flex ${
        collapsed ? 'w-16' : 'w-[200px]'
      } flex-shrink-0 bg-[#0b0b0b] border-r border-[#202023] flex flex-col justify-between py-4 px-3 sticky top-0 h-screen select-none z-30 transition-all duration-200`}
      data-purpose="navigation-sidebar"
    >
      <div>
        {/* Logo & Collapse Header */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-2 mb-6`}>
          <Link
            to="/"
            className="flex items-center gap-2 group cursor-pointer focus:outline-none"
            title="Tpaid Home"
          >
            <div className="w-7 h-7 rounded-lg bg-[#161616] border border-[#303033] flex items-center justify-center group-hover:border-[#ff2d55] transition-colors">
              <TwitchIcon className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
            </div>
            {!collapsed && (
              <span className="font-extrabold tracking-tight text-white text-base">
                Tpaid
              </span>
            )}
          </Link>
          
          <button
            onClick={onToggleCollapse}
            className="text-zinc-500 hover:text-white text-xs font-mono transition-colors p-1 rounded hover:bg-[#141418] cursor-pointer"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1" data-purpose="sidebar-menu">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center ${
                  collapsed ? 'justify-center px-2' : 'justify-start px-3'
                } py-2 rounded-lg text-sm font-medium transition-all group relative cursor-pointer ${
                  isActive
                    ? 'bg-[#191919] text-white shadow-sm font-semibold'
                    : 'text-zinc-400 hover:text-white hover:bg-[#151515]'
                }`}
                title={collapsed ? item.label : undefined}
              >
                {/* Active Indicator Bar if on active page */}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[#ff2d55] rounded-r-full shadow-[0_0_8px_#ff2d55]" />
                )}

                <span
                  className={`${
                    isActive                     ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                  } transition-colors`}
                >
                  {item.icon}
                </span>

                {!collapsed && (
                  <span className="ml-3 truncate">{item.label}</span>
                )}

                {/* Pulsing dot for Launch button */}
                {item.isAction && !collapsed && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#ff2d55] animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer / Tpaid Indicator Badge */}
      <div className="px-1 pt-3 border-t border-[#1a1a20]" data-purpose="sidebar-brand-badge">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#181818] flex items-center justify-center border border-[#303033] shrink-0">
              <TwitchIcon className="w-3.5 h-3.5 text-white" />
            </div>
            {!collapsed && (
              <div>
                <div className="text-[13px] font-semibold text-white leading-tight">Tpaid</div>
                <div className="text-[10px] text-zinc-400 leading-tight">On-chain creator fees</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 text-zinc-500">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-zinc-300 transition-colors"
                title="Follow on X"
              >
                <XTwitterIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
