/**
 * Robinhood Chain Network Specifications and EIP-1193 Helpers
 * 
 * Robinhood Chain is Robinhood's Arbitrum Orbit-powered Ethereum Layer-2
 * Network Name: Robinhood Chain
 * Chain ID: 4663 (0x1237)
 * Currency: ETH
 * RPC: https://rpc.mainnet.chain.robinhood.com
 * Explorer: https://robinhoodchain.blockscout.com
 */

export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
  isRobinhood?: boolean;
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    robinhood?: EthereumProvider;
  }
}

export const ROBINHOOD_CHAIN_MAINNET = {
  chainId: '0x1237', // 4663 in hex
  chainIdDecimal: 4663,
  chainName: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
  blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
};

export function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === 'undefined') return null;

  // Check window.robinhood first if specifically provided
  if (window.robinhood && typeof window.robinhood.request === 'function') {
    return window.robinhood;
  }

  // Check window.ethereum
  if (window.ethereum && typeof window.ethereum.request === 'function') {
    // If multiple providers exist in an array (e.g. Robinhood Wallet + MetaMask)
    if (Array.isArray(window.ethereum.providers)) {
      const robinhoodProvider = window.ethereum.providers.find(
        (p) => p.isRobinhood
      );
      if (robinhoodProvider) return robinhoodProvider;
      return window.ethereum.providers[0];
    }
    return window.ethereum;
  }

  return null;
}

export function getInjectedProviders(): EthereumProvider[] {
  if (typeof window === 'undefined') return [];
  const providers = Array.isArray(window.ethereum?.providers)
    ? window.ethereum.providers
    : window.ethereum
      ? [window.ethereum]
      : [];
  const all = window.robinhood ? [window.robinhood, ...providers] : providers;
  return all.filter((provider, index) => (
    typeof provider.request === 'function' &&
    all.findIndex((candidate) => candidate === provider) === index
  ));
}

export function getProviderName(provider: EthereumProvider, index: number): string {
  if (provider.isRobinhood || provider === window.robinhood) return 'Robinhood Wallet';
  if (provider.isMetaMask) return 'MetaMask';
  return `Browser Wallet ${index + 1}`;
}

/**
 * Format address to 0x1234...5678
 */
export function formatAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format balance in Wei hex or string to ETH
 */
export function formatEthBalance(weiValue: string | number | null): string {
  if (!weiValue) return '0.00 ETH';
  try {
    const weiNum = typeof weiValue === 'string' && weiValue.startsWith('0x')
      ? parseInt(weiValue, 16)
      : Number(weiValue);
    const eth = weiNum / 1e18;
    return `${eth.toFixed(4)} ETH`;
  } catch {
    return '0.00 ETH';
  }
}

/**
 * Request account connection and prompt switching to Robinhood Chain
 */
export async function connectAndRequestRobinhoodChain(
  selectedProvider?: EthereumProvider
): Promise<{ address: string; chainId: number; balance: string }> {
  const provider = selectedProvider || getInjectedProvider();

  if (!provider) {
    throw new Error('NO_PROVIDER');
  }

  // Ask the selected wallet to show its account picker instead of silently
  // reusing the last account it authorized for this site.
  try {
    await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (permissionError: unknown) {
    const error = permissionError as { code?: number; message?: string };
    const unsupported = error.code === -32601 || error.code === 4200 ||
      error.message?.toLowerCase().includes('unsupported');
    if (!unsupported) throw permissionError;
  }

  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('NO_ACCOUNTS_RETURNED');
  }

  const userAddress = accounts[0];

  // 2. Request switch or addition of Robinhood Chain
  const targetConfig = ROBINHOOD_CHAIN_MAINNET;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetConfig.chainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    
    // Code 4902 means the chain has not been added to the wallet yet
    if (
      err?.code === 4902 ||
      err?.data?.originalError?.code === 4902 ||
      (typeof err?.message === 'string' &&
        (err.message.includes('4902') ||
         err.message.toLowerCase().includes('unrecognized') ||
         err.message.toLowerCase().includes('not added')))
    ) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: targetConfig.chainId,
            chainName: targetConfig.chainName,
            nativeCurrency: targetConfig.nativeCurrency,
            rpcUrls: targetConfig.rpcUrls,
            blockExplorerUrls: targetConfig.blockExplorerUrls,
          },
        ],
      });
    } else {
      // Re-throw if user rejected or another fatal error
      throw switchError;
    }
  }

  // 3. Query current chain ID to confirm
  const currentChainHex = (await provider.request({
    method: 'eth_chainId',
  })) as string;
  const currentChainId = parseInt(currentChainHex, 16);

  // 4. Query balance on Robinhood Chain
  let balance = '0.00 ETH';
  try {
    const balanceHex = (await provider.request({
      method: 'eth_getBalance',
      params: [userAddress, 'latest'],
    })) as string;
    balance = formatEthBalance(balanceHex);
  } catch {
    balance = '0.00 ETH';
  }

  return {
    address: userAddress,
    chainId: currentChainId,
    balance,
  };
}

/**
 * Switch directly to Robinhood Chain if already connected on another network
 */
export async function switchToRobinhoodChain(): Promise<number> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error('NO_PROVIDER');
  }

  const targetConfig = ROBINHOOD_CHAIN_MAINNET;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetConfig.chainId }],
    });
  } catch (switchError: unknown) {
    const err = switchError as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (
      err?.code === 4902 ||
      err?.data?.originalError?.code === 4902 ||
      (typeof err?.message === 'string' &&
        (err.message.includes('4902') ||
         err.message.toLowerCase().includes('unrecognized') ||
         err.message.toLowerCase().includes('not added')))
    ) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: targetConfig.chainId,
            chainName: targetConfig.chainName,
            nativeCurrency: targetConfig.nativeCurrency,
            rpcUrls: targetConfig.rpcUrls,
            blockExplorerUrls: targetConfig.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw switchError;
    }
  }

  const currentChainHex = (await provider.request({
    method: 'eth_chainId',
  })) as string;
  return parseInt(currentChainHex, 16);
}
