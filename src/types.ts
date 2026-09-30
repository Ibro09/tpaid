export type NavTab = 
  | 'home'
  | 'explore'
  | 'payments'
  | 'analytics'
  | 'leaderboard'
  | 'launch'
  | 'get-paid'
  | 'docs';

export interface TokenItem {
  id: string;
  rank: number;
  name: string;
  ticker: string;
  creatorHandle: string;
  creatorName: string;
  creatorAvatar: string;
  creatorAddress?: string;
  creatorFeeRecipient?: string;
  imageUrl: string;
  marketCap: number; // in USD
  volume24h: number;
  volume24hQuote?: string;
  volume24hSymbol?: string;
  priceChange24h: number; // percentage, e.g. 6.1 or -20.4
  age: string;
  description?: string;
  totalFeesPaid: number;
  tokensCount?: number;
  createdAt?: number;
  updatedAt?: number;
  launchBlock?: number;
  launchTxHash?: string;
  creatorFeeSnapshot?: {
    asset: string;
    symbol?: string;
    decimals?: number;
    earned: string;
    pendingSweep?: string;
    credited: string;
    claimed: string;
    remaining: string;
    capturedAt: number;
  };
  source?: 'tipped' | 'pons';
  progressPercent?: number;
}

export interface CreatorProfile {
  id: string;
  handle: string;
  name: string;
  avatar: string;
  tokensCount: number;
  creatorFeesPaid: number;
  diamonds: number; // Twitch Bits / Cheers
  bits?: number;
  category?: string;
  isLive?: boolean;
  isVerified?: boolean;
}

export interface PaymentReceipt {
  id: string;
  recipientHandle: string;
  recipientName: string;
  recipientAvatar: string;
  isVerified?: boolean;
  avatarEmoji?: string;
  tokenTicker?: string;
  amount: number;
  milestone: number;
  lifetimeAmount: number;
  timeAgo: string;
  txHash: string;
  diamonds: number; // Bits equivalent
  bits?: number;
  giftType: string; // e.g. "Tier 3 Sub", "10,000 Bits Cheer", "Sub Bomb (50x)"
}

export interface LiveFeedItem {
  id: string;
  amount: number;
  creatorHandle: string;
  creatorAvatar?: string;
  avatarText?: string;
  timeAgo: string;
}
