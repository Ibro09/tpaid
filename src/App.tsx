/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TokenItem, CreatorProfile, PaymentReceipt } from './types';
import { Sidebar } from './components/Sidebar';
import { TopNavbar } from './components/TopNavbar';
import { HomeView } from './components/HomeView';
import { ExploreView } from './components/ExploreView';
import { LaunchView } from './components/LaunchView';
import { LeaderboardView } from './components/LeaderboardView';
import { DocsView } from './components/DocsView';
import { TokenDetailView } from './components/TokenDetailView';
import { WalletModal } from './components/WalletModal';
import { WalletProvider, useWallet } from './context/WalletContext';
import { MobileNav } from './components/MobileNav';
import { ProfileView } from './components/ProfileView';

function MainApp() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { walletAddress } = useWallet();

  // App data state
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [receipts] = useState<PaymentReceipt[]>([]);
  const [exploreTokensLoading, setExploreTokensLoading] = useState(true);
  const [exploreTokensError, setExploreTokensError] = useState<string | null>(null);

  const handleExploreTokensLoaded = useCallback((loadedTokens: TokenItem[]) => {
    const realTokens = loadedTokens.filter((token) => /^0x[a-fA-F0-9]{40}$/.test(token.id));
    setTokens((current) => {
      const previousById = new Map(current.map((token) => [token.id.toLowerCase(), token]));
      const nextById = new Map<string, TokenItem>();
      realTokens.forEach((token) => {
        const previous = previousById.get(token.id.toLowerCase());
        nextById.set(token.id.toLowerCase(), {
          ...previous,
          ...token,
          imageUrl: token.imageUrl || previous?.imageUrl || '',
          creatorAvatar: token.creatorAvatar || previous?.creatorAvatar || '',
          marketCap: token.marketCap > 0 ? token.marketCap : previous?.marketCap ?? 0,
          volume24h: token.volume24h > 0 ? token.volume24h : previous?.volume24h ?? 0,
          progressPercent: token.progressPercent ?? previous?.progressPercent,
        });
      });
      return [...nextById.values()].sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
    });
    setExploreTokensLoading(false);
    setExploreTokensError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSavedLaunches = async () => {
      try {
        const response = await fetch('/api/explore/tokens?limit=100');
        const payload = await response.json() as { tokens?: TokenItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Saved Explore tokens could not be loaded.');
        if (!cancelled) {
          handleExploreTokensLoaded((payload.tokens || []).map((token) => ({
            ...token,
            source: 'tipped',
          })));
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Home Explore token load failed:', error);
          setExploreTokensLoading(false);
          setExploreTokensError(error instanceof Error ? error.message : 'Explore tokens could not be loaded.');
        }
      }
    };
    void loadSavedLaunches();
    return () => { cancelled = true; };
  }, [handleExploreTokensLoaded]);

  // Modals state
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  // Handler when a user launches a token
  const handleTokenCreated = (newToken: TokenItem) => {
    setTokens((previous) => [
      newToken,
      ...previous.filter((token) => token.id.toLowerCase() !== newToken.id.toLowerCase()),
    ]);

    // Check if creator exists or add
    setCreators((prev) => {
      const existing = prev.find((c) => c.handle.toLowerCase() === newToken.creatorHandle.toLowerCase());
      if (existing) {
        return prev.map((c) =>
          c.id === existing.id
            ? { ...c, tokensCount: c.tokensCount + 1 }
            : c
        );
      } else {
        return [
          {
            id: `cr-${Date.now()}`,
            handle: newToken.creatorHandle,
            name: newToken.creatorName,
            avatar: newToken.creatorAvatar,
            tokensCount: 1,
            creatorFeesPaid: 0,
            diamonds: 0,
            bits: 0,
            isVerified: true,
          },
          ...prev,
        ];
      }
    });
  };

  return (
    <div className="app-shell min-w-0 bg-[#080808] text-white flex flex-row overflow-hidden font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
        {/* Top Sticky Navbar */}
        <TopNavbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenWalletModal={() => setWalletModalOpen(true)}
        />

        {/* Dynamic Page Routes */}
        <div className="flex-1 min-w-0 flex flex-col pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0">
          <Routes>
            <Route
              path="/"
              element={
                <HomeView
                  tokens={tokens}
                  receipts={receipts}
                  tokensLoading={exploreTokensLoading}
                  tokensError={exploreTokensError}
                />
              }
            />
            <Route
              path="/explore"
              element={
                <ExploreView
                  tokens={tokens}
                  onTokensLoaded={handleExploreTokensLoaded}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
              }
            />
            <Route
              path="/launch"
              element={
                <LaunchView
                  onTokenCreated={handleTokenCreated}
                  walletConnected={!!walletAddress}
                  walletAddress={walletAddress || undefined}
                  onOpenWallet={() => setWalletModalOpen(true)}
                />
              }
            />
            <Route
              path="/leaderboard"
              element={<LeaderboardView creators={creators} />}
            />
            <Route
              path="/docs"
              element={<DocsView />}
            />
            <Route
              path="/token/:id"
              element={
                <TokenDetailView
                  tokens={tokens}
                />
              }
            />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/profile/:address" element={<ProfileView />} />
            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      <MobileNav />

      {/* Wallet Modal */}
      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <MainApp />
      </WalletProvider>
    </BrowserRouter>
  );
}
