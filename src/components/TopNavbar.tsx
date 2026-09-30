import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Copy, Check, ExternalLink, AlertTriangle } from 'lucide-react';
import { RobinhoodIcon } from './Icons';
import { useWallet } from '../context/WalletContext';
import { formatAddress } from '../utils/robinhoodChain';
import { getPonsV2TokenDetails } from '../utils/ponsV2';

interface TopNavbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenWalletModal: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenWalletModal,
}) => {
  const navigate = useNavigate();
  const { walletAddress, isRobinhoodChain, balance, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [isSearchingToken, setIsSearchingToken] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const tokenCA = '0x4663d91Af5C91e84C2707297e59c25B6c214663';
  const displayCA = '0x4663...4663';

  const handleCopyCA = () => {
    navigator.clipboard.writeText(tokenCA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setSearchError(null);
    if (/^0x[a-fA-F0-9]{40}$/.test(query)) {
      setIsSearchingToken(true);
      try {
        await getPonsV2TokenDetails(query as `0x${string}`);
        onSearchChange('');
        navigate(`/token/${query}`);
      } catch {
        setSearchError('No Pons V2 token found for that contract address.');
      } finally {
        setIsSearchingToken(false);
      }
      return;
    }

    navigate('/explore');
  };

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!walletMenuRef.current?.contains(event.target as Node)) setWalletMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const copyWalletAddress = async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setWalletMenuOpen(false);
  };

  return (
    <div className="w-full shrink-0 z-20">
      {/* Top Announcement Bar */}
      <div
        className="bg-[#181818] border-b border-[#252525] py-1.5 px-3 text-center text-[11px] sm:text-xs flex items-center justify-center gap-1.5 text-zinc-400 select-none whitespace-nowrap overflow-hidden"
        data-purpose="top-announcement"
      >
        <span className="text-[#ff2d55] text-sm">✦</span>
        <span className="font-bold text-zinc-200">15% of all launch fees</span>
        <span className="hidden sm:inline">now go directly to buying and burning</span>
        <span>$TIPPED</span>
        <button
          onClick={() => navigate('/docs')}
          className="hidden sm:inline text-zinc-400 hover:text-white underline decoration-zinc-600 underline-offset-2 transition-colors cursor-pointer"
        >
          How it works →
        </button>
      </div>

      {/* Main Header Bar */}
      <header
        className="border-b border-[#242424] px-2.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sticky top-0 bg-[#080808]/95 backdrop-blur z-20"
        data-purpose="main-header"
      >
        {/* Left: Token Address Pill */}
        <div className="hidden sm:flex items-center gap-2 bg-[#121217] border border-[#333] hover:border-[#ff2d55]/80 transition-colors px-3 py-1.5 rounded-full text-xs font-mono">
          <span className="font-bold text-white tracking-wider">$TIPPED</span>
          <span className="text-zinc-500 text-[11px] hidden sm:inline">CA {displayCA}</span>
          <span className="text-zinc-500 text-[11px] sm:hidden">CA</span>
          <button
            onClick={handleCopyCA}
            className="text-zinc-400 hover:text-white transition-colors p-0.5 cursor-pointer"
            title="Copy Contract Address"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#00C805]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
          <a
            href={`https://robinhoodchain.blockscout.com/token/${tokenCA}`}
            target="_blank"
            rel="noreferrer"
            className="text-zinc-400 hover:text-white transition-colors p-0.5"
            title="View on Robinhood Blockscout Explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Middle: Search Bar */}
        <form onSubmit={(event) => void handleSearch(event)} className="flex-1 max-w-xl mx-0 sm:mx-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                onSearchChange(event.target.value);
                setSearchError(null);
              }}
              placeholder="Search tokens or paste a contract address"
              aria-label="Search tokens or contract address"
              className="w-full bg-[#0d0d0d] border border-[#292929] focus:border-[#ff2d55]/80 rounded-full py-2 sm:py-1.5 pl-10 pr-24 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearchingToken}
              className="absolute inset-y-1 right-1 rounded-full bg-[#ff2d55] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#e5264b] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isSearchingToken ? 'Searching…' : 'Search'}
            </button>
            {searchQuery && !isSearchingToken && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-zinc-500 hover:text-white cursor-pointer"
                style={{ right: '4.6rem' }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {searchError && <div role="alert" className="absolute mt-1 rounded-lg border border-zinc-800 bg-[#111] px-3 py-2 text-xs text-zinc-300 shadow-lg">{searchError}</div>}
        </form>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Active Chain Pill (When Connected) */}
          

          <button
            onClick={() => navigate('/launch')}
            className="hidden sm:flex bg-[#ff2d55] hover:bg-[#ff456a] active:scale-95 text-white px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold shadow-md shadow-rose-950/40 transition-all cursor-pointer items-center gap-1.5"
          >
            <span>Launch</span>
          </button>
          
          <div className="relative" ref={walletMenuRef}>
          <button
            onClick={() => walletAddress ? setWalletMenuOpen((open) => !open) : onOpenWalletModal()}
            className={`border px-3 sm:px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              walletAddress
                ? isRobinhoodChain
                  ? 'bg-[#121217] hover:bg-[#1a1a20] border-[#00C805]/40 text-white'
                  : 'bg-amber-950/40 hover:bg-amber-900/40 border-amber-500/50 text-amber-200'
                : 'bg-gradient-to-r from-[#00C805]/20 to-[#121217] hover:from-[#00C805]/30 border-[#00C805]/50 text-white'
            }`}
          >
            {walletAddress ? (
              <>
                <span className={`w-2 h-2 rounded-full ${isRobinhoodChain ? 'bg-[#00C805]' : 'bg-amber-400 animate-pulse'}`} />
                <span className="font-mono text-[11px] text-zinc-200 font-medium">
                  {formatAddress(walletAddress)}
                </span>
               
              </>
            ) : (
              <span>Connect wallet</span>
            )}
          </button>
          {walletAddress && walletMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-zinc-700 bg-[#151517] p-2 shadow-2xl">
              <button type="button" onClick={() => { setWalletMenuOpen(false); navigate('/profile'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-zinc-800">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">♙</span>
                <span className="font-mono text-sm text-white">{formatAddress(walletAddress)}</span>
              </button>
              <div className="my-1 border-t border-zinc-800" />
              <button type="button" onClick={() => void copyWalletAddress()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"><Copy className="h-3.5 w-3.5" />Copy address</button>
              <button type="button" onClick={() => { setWalletMenuOpen(false); disconnect(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-red-400 hover:bg-red-950/30"><span>↪</span>Disconnect</button>
            </div>
          )}
          </div>
        </div>
      </header>
    </div>
  );
};
