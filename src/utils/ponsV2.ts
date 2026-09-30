import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  parseUnits,
  formatUnits,
  formatEther,
  toHex,
  decodeEventLog,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';
import { getInjectedProvider } from './robinhoodChain';

export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Robinhood ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
} as const;

export const PONS_V2_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as Address;
export const PONS_V2_LAUNCH_BUY_ROUTER = '0xe33E9E479dF8802cb0866d5d05258bEc4cF62948' as Address;
export const PONS_V2_GRADUATION = '0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB' as Address;
export const TIPPED_LAUNCH_FEE_RECIPIENT = '0x6260ac97F340d3cdb1D6eee3aD16209C93ebF4fc' as Address;
export const TIPPED_LAUNCH_FEE_ETH = '0.00065';

type LaunchPaymentRequirements = { value: bigint; gas: bigint };
type BeforeLaunchPayment = (requirements: LaunchPaymentRequirements) => Promise<void>;

async function invokeBeforeLaunch(
  callback: BeforeLaunchPayment | undefined,
  account: Address,
  to: Address,
  value: bigint,
  gas: bigint | undefined,
  data: Hex,
) {
  if (!callback) return;
  const gasEstimate = gas ?? await publicClient.estimateGas({ account, to, value, data });
  await callback({ value, gas: gasEstimate });
}

export async function waitForTippedLaunchFee(transactionHash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== 'success') throw new Error(`The launch fee transfer reverted (${transactionHash}).`);
  return receipt;
}

export async function collectTippedLaunchFee(
  account: Address,
  requirements: LaunchPaymentRequirements,
  onSubmitted?: (transactionHash: Hex) => void,
) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to pay the launch fee.');
  const activeChain = await provider.request({ method: 'eth_chainId' }) as string;
  if (parseInt(activeChain, 16) !== ROBINHOOD_CHAIN.id) {
    throw new Error('Switch the connected wallet to Robinhood Chain before paying the launch fee.');
  }
  const activeAccounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (!activeAccounts[0] || activeAccounts[0].toLowerCase() !== account.toLowerCase()) {
    throw new Error('The active wallet account changed. Reconnect and try again.');
  }

  const feeWei = parseEther(TIPPED_LAUNCH_FEE_ETH);
  const networkFees = await publicClient.estimateFeesPerGas();
  const feePerGas = networkFees.maxFeePerGas ?? networkFees.gasPrice;
  if (feePerGas === undefined) throw new Error('Unable to estimate Robinhood Chain transaction fees.');
  const feeTransferGasCost = 21_000n * feePerGas;
  const launchGasCost = requirements.gas * feePerGas;
  const requiredBalance = feeWei + feeTransferGasCost + requirements.value + launchGasCost;
  const balanceHex = await provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }) as string;
  const balance = BigInt(balanceHex);
  if (balance < requiredBalance) {
    throw new Error(`Insufficient Robinhood ETH for both transactions. The Tpaid launch fee is ${TIPPED_LAUNCH_FEE_ETH} ETH; including the Pons launch value and estimated network fees, at least ${formatEther(requiredBalance)} ETH is required.`);
  }

  const walletClient = createWalletClient({
    account,
    chain: ROBINHOOD_CHAIN,
    transport: custom(provider),
  });
  const transactionHash = await walletClient.sendTransaction({
    account,
    to: TIPPED_LAUNCH_FEE_RECIPIENT,
    value: feeWei,
  });
  onSubmitted?.(transactionHash);
  await waitForTippedLaunchFee(transactionHash);
  return {
    transactionHash,
    feeWei,
    feeEth: formatEther(feeWei),
  };
}

const factoryAbi = [
  { type: 'event', name: 'TokenLaunched', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'curve', type: 'address', indexed: true },
    { name: 'deployer', type: 'address', indexed: true },
    { name: 'pairToken', type: 'address', indexed: false },
    { name: 'launchConfigId', type: 'uint256', indexed: false },
    { name: 'graduationThreshold', type: 'uint256', indexed: false },
  ] },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'launchEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'canLaunch', stateMutability: 'view', inputs: [{ name: 'launcher', type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'launchConfigCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getLaunchConfig', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'supply', type: 'uint256' }, { name: 'curveFeeBps', type: 'uint256' }, { name: 'phantomQuote', type: 'uint256' },
    { name: 'graduationThreshold', type: 'uint256' }, { name: 'poolFee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'enabled', type: 'bool' },
  ] }] },
  { type: 'function', name: 'previewLaunchEconomics', stateMutability: 'view', inputs: [{ name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'getLaunchedToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'tuple', components: [
    { name: 'token', type: 'address' }, { name: 'curve', type: 'address' }, { name: 'deployer', type: 'address' }, { name: 'creatorFeeRecipient', type: 'address' },
    { name: 'pairToken', type: 'address' }, { name: 'graduationThreshold', type: 'uint256' }, { name: 'poolFee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' },
    { name: 'creatorTaxBps', type: 'uint16' }, { name: 'buybackEnabled', type: 'bool' }, { name: 'phase', type: 'uint8' }, { name: 'sweptQuote', type: 'uint256' },
    { name: 'sweptTokens', type: 'uint256' }, { name: 'sweptAt', type: 'uint256' }, { name: 'exists', type: 'bool' },
  ] }] },
  { type: 'function', name: 'feeEscrow', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'launchToken',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'logo', type: 'string' },
          { name: 'description', type: 'string' },
          {
            name: 'socials',
            type: 'tuple',
            components: [
              { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' }, { name: 'website', type: 'string' }, { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'creatorFeeRecipient', type: 'address' }, { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' }, { name: 'expectedEconomics', type: 'bytes32' }, { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
    ],
    outputs: [{ name: 'token', type: 'address' }, { name: 'curve', type: 'address' }],
  },
] as const;

export type PonsV2Launch = {
  token?: Address;
  curve?: Address;
  deployer?: Address;
  pairToken?: Address;
  launchConfigId?: bigint;
  graduationThreshold?: bigint;
  createdAt?: number;
};

const tokenAbi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'getTokenInfo', stateMutability: 'view', inputs: [], outputs: [
    { name: 'tokenDeployer', type: 'address' },
    { name: 'tokenLogo', type: 'string' },
    { name: 'tokenDescription', type: 'string' },
    { name: 'tokenSocials', type: 'tuple', components: [
      { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' },
      { name: 'discord', type: 'string' }, { name: 'website', type: 'string' }, { name: 'farcaster', type: 'string' },
    ] },
  ] },
  { type: 'function', name: 'logo', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'description', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'deployer', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'curve', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'socials', stateMutability: 'view', inputs: [], outputs: [{ type: 'tuple', components: [
    { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' }, { name: 'discord', type: 'string' }, { name: 'website', type: 'string' }, { name: 'farcaster', type: 'string' },
  ] }] },
] as const;

const graduationAbi = [
  { type: 'function', name: 'graduationStatus', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [
    { name: 'pairedPrincipal', type: 'uint256' },
    { name: 'threshold', type: 'uint256' },
    { name: 'graduated', type: 'bool' },
  ] },
] as const;

const escrowAbi = [
  { type: 'event', name: 'Credited', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'depositor', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'CreditedToken', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'token', type: 'address', indexed: true },
    { name: 'depositor', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'Claimed', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'ClaimedToken', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'token', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOfToken', stateMutability: 'view', inputs: [{ name: 'recipient', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'claimToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const curveFeeEventsAbi = [{
  type: 'event',
  name: 'FeesSwept',
  inputs: [
    { name: 'protocolAmount', type: 'uint256', indexed: false },
    { name: 'buybackAmount', type: 'uint256', indexed: false },
    { name: 'creatorAmount', type: 'uint256', indexed: false },
  ],
}] as const;

const curveTradeEventsAbi = [
  {
    type: 'event',
    name: 'CurveBuy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveSell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
] as const;

const hookFeeEventsAbi = [
  {
    type: 'event',
    name: 'PoolRegistered',
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'memecoin', type: 'address', indexed: false },
      { name: 'quoteToken', type: 'address', indexed: false },
      { name: 'creator', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PoolFeesSwept',
    inputs: [
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'protocolAmount', type: 'uint256', indexed: false },
      { name: 'buybackAmount', type: 'uint256', indexed: false },
      { name: 'creatorAmount', type: 'uint256', indexed: false },
      { name: 'tokensLocked', type: 'uint256', indexed: false },
    ],
  },
] as const;

const PONS_V2_MEME_HOOK = '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' as Address;
const TOKEN_LAUNCHED_TOPIC = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607' as Hex;
const FEES_SWEPT_TOPIC = '0x9f4cd7c4ed99d08a797804560c9c5d71d2cf7e101f2e3b5e7d1ca8a24c370e4f' as Hex;
const POOL_REGISTERED_TOPIC = '0x01bf263a1db1652580721573296e1a1fa70b3d4c87f61d02a69c4e1109d2d573' as Hex;
const POOL_FEES_SWEPT_TOPIC = '0x2f3c43579b9064b6f28edcf41608f3815792d274a56afe024359703cb4ea9b30' as Hex;
const CREDITED_TOPIC = '0x4e45da441832cf53bdaa69235704fc0575e68210f459ee1562911024b12967d5' as Hex;
const CREDITED_TOKEN_TOPIC = '0x5d104c62f50449fadfe6f4013c8f36588d32737f94b5ac9b83ddad33b3e1ffdf' as Hex;
const CLAIMED_TOPIC = '0xd8138f8a3f377c5259ca548e70e4c2de94f129f5a11036a15b69513cba2b426a' as Hex;
const CLAIMED_TOKEN_TOPIC = '0xdbc1ea3a8459e4c7e11fb385b52bbb5cc8c8ab85eec5d883ac9aa78c171f5141' as Hex;
const CURVE_BUY_TOPIC = '0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455' as Hex;
const CURVE_SELL_TOPIC = '0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df' as Hex;

const curveTradeAbi = [
  { type: 'function', name: 'buy', stateMutability: 'payable', inputs: [
    { name: 'quoteIn', type: 'uint256' }, { name: 'minTokensOut', type: 'uint256' }, { name: 'recipient', type: 'address' },
  ], outputs: [{ name: 'tokensOut', type: 'uint256' }] },
  { type: 'function', name: 'sell', stateMutability: 'nonpayable', inputs: [
    { name: 'tokensIn', type: 'uint256' }, { name: 'minQuoteOut', type: 'uint256' }, { name: 'recipient', type: 'address' },
  ], outputs: [{ name: 'quoteOut', type: 'uint256' }] },
] as const;

const erc20TradeAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [
    { name: 'account', type: 'address' },
  ], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [
    { name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' },
  ], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [
    { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
  ], outputs: [{ type: 'uint256' }] },
] as const;

export async function getPonsV2TradingBalances(account: Address, token: Address, decimals: number) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('Connect a wallet to load trading balances.');
  const nativeHex = await provider.request({
    method: 'eth_getBalance',
    params: [account, 'latest'],
  }) as string;
  const tokenCall = encodeFunctionData({
    abi: erc20TradeAbi,
    functionName: 'balanceOf',
    args: [account],
  });
  const tokenHex = await provider.request({
    method: 'eth_call',
    params: [{ to: token, data: tokenCall }, 'latest'],
  }) as string;
  const native = BigInt(nativeHex);
  const tokenRaw = decodeFunctionResult({
    abi: erc20TradeAbi,
    functionName: 'balanceOf',
    data: tokenHex as `0x${string}`,
  }) as bigint;
  return {
    native,
    token: tokenRaw,
    nativeFormatted: formatEther(native),
    tokenFormatted: Number(formatUnits(tokenRaw, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 }),
  };
}

const launchBuyRouterAbi = [
  {
    type: 'function',
    name: 'launchAndBuy',
    stateMutability: 'payable',
    inputs: [
      { name: 'params', type: 'tuple', components: [
        { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'logo', type: 'string' },
        { name: 'description', type: 'string' }, { name: 'socials', type: 'tuple', components: [
          { name: 'twitter', type: 'string' }, { name: 'telegram', type: 'string' }, { name: 'discord', type: 'string' },
          { name: 'website', type: 'string' }, { name: 'farcaster', type: 'string' },
        ] },
        { name: 'creatorFeeRecipient', type: 'address' }, { name: 'creatorTaxBps', type: 'uint16' },
        { name: 'buybackEnabled', type: 'bool' }, { name: 'expectedEconomics', type: 'bytes32' }, { name: 'salt', type: 'bytes32' },
      ] },
      { name: 'launchConfigId', type: 'uint256' }, { name: 'pairToken', type: 'address' }, { name: 'quoteIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' }, { name: 'recipient', type: 'address' }, { name: 'snipeTaxExemptions', type: 'address[]' },
    ],
    outputs: [{ name: 'token', type: 'address' }, { name: 'curve', type: 'address' }, { name: 'tokensOut', type: 'uint256' }],
  },
] as const;

const publicClient = createPublicClient({
  chain: ROBINHOOD_CHAIN,
  transport: http(
    typeof window === 'undefined'
      ? ROBINHOOD_CHAIN.rpcUrls.default.http[0]
      : '/api/robinhood-rpc',
    { timeout: 15_000, retryCount: 0 },
  ),
});

const tokenDetailsCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<typeof loadPonsV2TokenDetails>> }>();
const launchesByAccountCache = new Map<string, { expiresAt: number; value: PonsV2Launch[] }>();
const pendingTokenDetails = new Map<string, Promise<Awaited<ReturnType<typeof loadPonsV2TokenDetails>>>>();
const pendingLaunchesByAccount = new Map<string, Promise<PonsV2Launch[]>>();
const CACHE_TTL_MS = 30_000;
const PROFILE_CACHE_KEY = 'pons-v2-launches:';

function readPersistedLaunches(account: Address): PonsV2Launch[] | null {
  try {
    const raw = window.localStorage.getItem(`${PROFILE_CACHE_KEY}${account.toLowerCase()}`);
    if (!raw) return null;
    return JSON.parse(raw, (key, value) => (
      ['launchConfigId', 'graduationThreshold'].includes(key) && typeof value === 'string'
        ? BigInt(value)
        : value
    )) as PonsV2Launch[];
  } catch {
    return null;
  }
}

function persistLaunches(account: Address, launches: PonsV2Launch[]) {
  try {
    window.localStorage.setItem(`${PROFILE_CACHE_KEY}${account.toLowerCase()}`, JSON.stringify(launches, (_, value) => (
      typeof value === 'bigint' ? value.toString() : value
    )));
  } catch {
    // Storage is optional; the in-memory cache remains authoritative.
  }
}

export function normalizePonsAssetUrl(value: string): string {
  if (!value) return '';
  if (value.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${value.slice(7)}`;
  if (value.startsWith('ar://')) return `https://arweave.net/${value.slice(5)}`;
  return value;
}

function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')}` as Hex;
}

function configuredPairToken(): Address {
  const value = import.meta.env.VITE_PONS_V2_PAIR_TOKEN || zeroAddress;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error('Invalid VITE_PONS_V2_PAIR_TOKEN.');
  return value as Address;
}

function configuredCreatorTaxBps(): number {
  const value = Number(import.meta.env.VITE_PONS_V2_CREATOR_TAX_BPS || '0');
  if (!Number.isInteger(value) || value < 0 || value > 1000) {
    throw new Error('VITE_PONS_V2_CREATOR_TAX_BPS must be an integer between 0 and 1000.');
  }
  return value;
}

export async function getPonsV2Config() {
  const count = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchConfigCount' });
  const configs = await Promise.all(Array.from({ length: Number(count) }, (_, index) =>
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'getLaunchConfig', args: [BigInt(index)] })
      .then((config) => ({ id: BigInt(index), ...config }))
  ));
  return {
    launchEnabled: await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchEnabled' }),
    launchFee: await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    configs: configs.filter((config) => config.enabled),
  };
}

export async function launchPonsV2(input: {
  account: Address;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  twitter?: string;
  website?: string;
  firstBuyEth: number;
}, beforeLaunch?: BeforeLaunchPayment): Promise<{ hash: Hex; token?: Address; blockNumber: bigint }> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to launch a token.');
  const activeChain = await provider.request({ method: 'eth_chainId' }) as string;
  if (parseInt(activeChain, 16) !== ROBINHOOD_CHAIN.id) {
    throw new Error('Switch the connected wallet to Robinhood Chain before launching.');
  }
  const activeAccounts = await provider.request({ method: 'eth_accounts' }) as string[];
  if (!activeAccounts[0] || activeAccounts[0].toLowerCase() !== input.account.toLowerCase()) {
    throw new Error('The active wallet account changed. Reconnect the wallet and try again.');
  }

  const pairToken = configuredPairToken();
  const configId = BigInt(import.meta.env.VITE_PONS_V2_CONFIG_ID || '0');
  const [enabled, allowed, launchFee, expectedEconomics] = await Promise.all([
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'canLaunch', args: [input.account] }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [configId, pairToken] }),
  ]);
  const balanceHex = await provider.request({ method: 'eth_getBalance', params: [input.account, 'latest'] }) as string;
  const balance = BigInt(balanceHex);
  const value = launchFee + parseEther(input.firstBuyEth.toString());
  if (balance < value) {
    throw new Error(`Insufficient Robinhood ETH for ${input.account}. This launch requires at least ${formatEther(value)} ETH plus gas, but this connected wallet has ${formatEther(balance)} ETH.`);
  }
  if (!enabled) throw new Error('Pons V2 token launches are currently disabled.');
  if (!allowed) throw new Error('This wallet is not currently allowed to launch on Pons V2.');

  const walletClient = createWalletClient({
    account: input.account,
    chain: ROBINHOOD_CHAIN,
    transport: custom(provider),
  });
  const launchParams = {
    name: input.name,
    symbol: input.symbol,
    logo: input.logo,
    description: input.description,
    socials: { twitter: input.twitter || '', telegram: '', discord: '', website: input.website || '', farcaster: '' },
    creatorFeeRecipient: TIPPED_LAUNCH_FEE_RECIPIENT,
    creatorTaxBps: configuredCreatorTaxBps(),
    buybackEnabled: true,
    expectedEconomics,
    salt: randomSalt(),
  };
  const launchArgs = [launchParams, configId, pairToken] as const;
  const request = await publicClient.simulateContract({
    address: PONS_V2_FACTORY,
    abi: factoryAbi,
    account: input.account,
    functionName: 'launchToken',
    args: launchArgs,
    value,
  });
  const launchData = encodeFunctionData({ abi: factoryAbi, functionName: 'launchToken', args: launchArgs });
  await invokeBeforeLaunch(beforeLaunch, input.account, PONS_V2_FACTORY, value, request.request.gas, launchData);
  const chainAfterPayment = await provider.request({ method: 'eth_chainId' }) as string;
  const accountAfterPayment = await provider.request({ method: 'eth_accounts' }) as string[];
  if (parseInt(chainAfterPayment, 16) !== ROBINHOOD_CHAIN.id
    || accountAfterPayment[0]?.toLowerCase() !== input.account.toLowerCase()) {
    throw new Error('The wallet account or network changed after the fee was paid; the launch was not submitted.');
  }
  const hash = await walletClient.writeContract(request.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Pons V2 launch transaction reverted (${hash}).`);

  const launchLog = receipt.logs.find((log) => log.address.toLowerCase() === PONS_V2_FACTORY.toLowerCase());
  const token = launchLog
    ? decodeEventLog({ abi: factoryAbi, data: launchLog.data, topics: launchLog.topics }).args.token
    : undefined;
  return { hash, token, blockNumber: receipt.blockNumber };
}

export async function launchAndBuyPonsV2(
  input: Parameters<typeof launchPonsV2>[0],
  beforeLaunch?: BeforeLaunchPayment,
): Promise<{ hash: Hex; token?: Address; blockNumber: bigint }> {
  const router = (import.meta.env.VITE_PONS_V2_LAUNCH_BUY_ROUTER || PONS_V2_LAUNCH_BUY_ROUTER) as Address;
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to launch and buy.');
  const activeChain = await provider.request({ method: 'eth_chainId' }) as string;
  if (parseInt(activeChain, 16) !== ROBINHOOD_CHAIN.id) {
    throw new Error('Switch the connected wallet to Robinhood Chain before launching.');
  }
  const pairToken = configuredPairToken();
  const configId = BigInt(import.meta.env.VITE_PONS_V2_CONFIG_ID || '0');
  const [enabled, allowed, launchFee, expectedEconomics] = await Promise.all([
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchEnabled' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'canLaunch', args: [input.account] }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'launchFee' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'previewLaunchEconomics', args: [configId, pairToken] }),
  ]);
  const quoteIn = parseEther(input.firstBuyEth.toString());
  const value = pairToken === zeroAddress ? launchFee + quoteIn : launchFee;
  const balanceHex = await provider.request({ method: 'eth_getBalance', params: [input.account, 'latest'] }) as string;
  const balance = BigInt(balanceHex);
  if (balance < value) {
    throw new Error(`Insufficient Robinhood ETH. This launch-and-buy requires at least ${formatEther(value)} ETH plus gas, but the connected wallet has ${formatEther(balance)} ETH.`);
  }
  if (!enabled) throw new Error('Pons V2 token launches are currently disabled.');
  if (!allowed) throw new Error('This wallet is not currently allowed to launch on Pons V2.');
  const walletClient = createWalletClient({ account: input.account, chain: ROBINHOOD_CHAIN, transport: custom(provider) });
  const launchParams = {
    name: input.name, symbol: input.symbol, logo: input.logo, description: input.description,
    socials: { twitter: input.twitter || '', telegram: '', discord: '', website: input.website || '', farcaster: '' },
    creatorFeeRecipient: TIPPED_LAUNCH_FEE_RECIPIENT, creatorTaxBps: configuredCreatorTaxBps(), buybackEnabled: true, expectedEconomics, salt: randomSalt(),
  };
  const launchArgs = [launchParams, configId, pairToken, quoteIn, 0n, input.account, []] as const;
  const request = await publicClient.simulateContract({
    address: router as Address,
    abi: launchBuyRouterAbi,
    account: input.account,
    functionName: 'launchAndBuy',
    args: launchArgs,
    value,
  });
  const launchData = encodeFunctionData({ abi: launchBuyRouterAbi, functionName: 'launchAndBuy', args: launchArgs });
  await invokeBeforeLaunch(beforeLaunch, input.account, router as Address, value, request.request.gas, launchData);
  const chainAfterPayment = await provider.request({ method: 'eth_chainId' }) as string;
  const accountAfterPayment = await provider.request({ method: 'eth_accounts' }) as string[];
  if (parseInt(chainAfterPayment, 16) !== ROBINHOOD_CHAIN.id
    || accountAfterPayment[0]?.toLowerCase() !== input.account.toLowerCase()) {
    throw new Error('The wallet account or network changed after the fee was paid; the launch was not submitted.');
  }
  const hash = await walletClient.writeContract(request.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Pons V2 launch-and-buy transaction reverted (${hash}).`);
  const launchLog = receipt.logs.find((log) => log.address.toLowerCase() === PONS_V2_FACTORY.toLowerCase());
  const token = launchLog
    ? decodeEventLog({ abi: factoryAbi, data: launchLog.data, topics: launchLog.topics }).args.token
    : undefined;
  return { hash, token, blockNumber: receipt.blockNumber };
}

async function loadPonsV2TokenDetails(token: Address) {
  const launch = await publicClient.readContract({
    address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'getLaunchedToken', args: [token],
  });
  const [nameResult, symbolResult, decimalsResult, supplyResult, infoResult, graduationResult] = await Promise.allSettled([
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'name' }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'symbol' }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'decimals' }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'totalSupply' }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'getTokenInfo' }),
    publicClient.readContract({ address: PONS_V2_GRADUATION, abi: graduationAbi, functionName: 'graduationStatus', args: [token] }),
  ]);
  const name = nameResult.status === 'fulfilled' ? nameResult.value : 'Pons V2 token';
  const symbol = symbolResult.status === 'fulfilled' ? symbolResult.value : 'TOKEN';
  const decimals = decimalsResult.status === 'fulfilled' ? decimalsResult.value : 18;
  const totalSupply = supplyResult.status === 'fulfilled' ? supplyResult.value : 0n;
  let logo = '';
  let description = '';
  let twitter = '';
  let telegram = '';
  let discord = '';
  let website = '';
  let farcaster = '';
  let tokenDeployer: Address | undefined;
  if (infoResult.status === 'fulfilled') {
    tokenDeployer = infoResult.value[0];
    logo = infoResult.value[1];
    description = infoResult.value[2];
    twitter = infoResult.value[3].twitter;
    telegram = infoResult.value[3].telegram;
    discord = infoResult.value[3].discord;
    website = infoResult.value[3].website;
    farcaster = infoResult.value[3].farcaster;
  } else {
    const [logoResult, descriptionResult, socialsResult] = await Promise.allSettled([
      publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'logo' }),
      publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'description' }),
      publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'socials' }),
    ]);
    if (logoResult.status === 'fulfilled') logo = logoResult.value;
    if (descriptionResult.status === 'fulfilled') description = descriptionResult.value;
    if (socialsResult.status === 'fulfilled') {
      twitter = socialsResult.value.twitter;
      telegram = socialsResult.value.telegram;
      discord = socialsResult.value.discord;
      website = socialsResult.value.website;
      farcaster = socialsResult.value.farcaster;
    }

  }
  return {
    name, symbol, decimals, totalSupply, description,
    logo: normalizePonsAssetUrl(logo),
    socials: { twitter, telegram, discord, website, farcaster },
    tokenDeployer,
    graduation: graduationResult.status === 'fulfilled' ? graduationResult.value : null,
    deployer: launch.deployer,
    curve: launch.curve,
    launch,
  };
}

export async function getPonsV2MarketData(
  curve: Address,
  decimals: number,
  totalSupply: bigint,
  pairedPrincipal: bigint = 0n,
  sweptQuote: bigint = 0n,
  quoteIsNative = true,
) {
  const quoteIn = parseEther('0.01');
  const supply = Number(totalSupply) / 10 ** decimals;
  const fallbackQuote = pairedPrincipal > 0n ? pairedPrincipal : sweptQuote;
  const fallbackPriceUsd = supply > 0 ? (Number(fallbackQuote) / 1e18 / supply) * 2850 : 0;
  try {
    const quote = await publicClient.simulateContract({
      address: curve,
      abi: curveTradeAbi,
      functionName: 'buy',
      args: [quoteIn, 0n, zeroAddress],
      value: quoteIn,
    });
    const tokensOut = quote.result;
    if (tokensOut <= 0n) return null;
    const tokenAmount = Number(tokensOut) / 10 ** decimals;
    const priceUsd = (0.01 / tokenAmount) * 2850;
    return {
      priceUsd,
      priceEth: quoteIsNative ? 0.01 / tokenAmount : null,
      marketCapUsd: priceUsd * supply,
      liquidityUsd: Number(fallbackQuote) / 1e18 * 2850,
      volume24hUsd: 0,
      change24h: 0,
    };
  } catch {
    return {
      priceUsd: fallbackPriceUsd,
      priceEth: quoteIsNative && supply > 0 ? Number(fallbackQuote) / 1e18 / supply : null,
      marketCapUsd: fallbackPriceUsd * supply,
      liquidityUsd: Number(fallbackQuote) / 1e18 * 2850,
      volume24hUsd: 0,
      change24h: 0,
    };
  }
}

export async function getPonsV2TokenDetails(token: Address) {
  const key = token.toLowerCase();
  const cached = tokenDetailsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingTokenDetails.get(key);
  if (pending) return pending;
  const request = loadPonsV2TokenDetails(token).then((value) => {
    tokenDetailsCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    pendingTokenDetails.delete(key);
    return value;
  }, (error) => {
    pendingTokenDetails.delete(key);
    throw error;
  });
  pendingTokenDetails.set(key, request);
  return request;
}

export async function resolvePonsV2TokenAddress(address: Address): Promise<Address | null> {
  try {
    const direct = await publicClient.readContract({
      address: PONS_V2_FACTORY,
      abi: factoryAbi,
      functionName: 'getLaunchedToken',
      args: [address],
    });
    if (direct.exists) return address;
  } catch {
    // Continue with the explorer index when the public RPC is unavailable.
  }

  const eventTopic = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
  const deploymentBlock = BigInt(import.meta.env?.VITE_PONS_V2_DEPLOYMENT_BLOCK || '26841846');
  try {
    const explorerUrl = new URL('https://robinhoodchain.blockscout.com/api');
    explorerUrl.searchParams.set('module', 'logs');
    explorerUrl.searchParams.set('action', 'getLogs');
    explorerUrl.searchParams.set('address', PONS_V2_FACTORY);
    explorerUrl.searchParams.set('topic0', eventTopic);
    explorerUrl.searchParams.set('fromBlock', deploymentBlock.toString());
    explorerUrl.searchParams.set('toBlock', 'latest');
    const response = await fetch(explorerUrl);
    if (!response.ok) return null;
    const payload = await response.json() as { status?: string; result?: Array<{ topics?: string[] }> };
    if (payload.status !== '1' || !Array.isArray(payload.result)) return null;
    const target = address.slice(2).toLowerCase();
    const matchingLog = payload.result.find((log) => {
      const topics = log.topics || [];
      return topics.slice(1, 4).some((topic) => topic.slice(-40).toLowerCase() === target);
    });
    if (!matchingLog?.topics) return null;
    const tokenTopic = matchingLog.topics[1];
    return tokenTopic ? `0x${tokenTopic.slice(-40)}` as Address : null;
  } catch {
    return null;
  }
}

export async function tradePonsV2(input: {
  token: Address;
  curve: Address;
  account: Address;
  type: 'buy' | 'sell';
  amount: string;
  decimals: number;
  slippageBps?: bigint;
}): Promise<{ hash: Hex; quote: bigint }> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('Connect a browser wallet before trading.');
  const walletClient = createWalletClient({ account: input.account, chain: ROBINHOOD_CHAIN, transport: custom(provider) });
  const amount = input.type === 'buy' ? parseEther(input.amount) : parseUnits(input.amount, input.decimals);
  if (amount <= 0n) throw new Error('Enter an amount greater than zero.');

  // The sell simulation executes the real allowance check. Approve before
  // simulating so the quote reflects the transaction that will be submitted.
  if (input.type === 'sell') {
    const allowance = await publicClient.readContract({
      address: input.token, abi: erc20TradeAbi, functionName: 'allowance', args: [input.account, input.curve],
    });
    if (allowance < amount) {
      const approval = await walletClient.writeContract({
        address: input.token, abi: erc20TradeAbi, functionName: 'approve', args: [input.curve, amount],
      });
      const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approval });
      if (approvalReceipt.status !== 'success') throw new Error('Token approval transaction reverted.');
    }
  }

  const quoteRequest = input.type === 'buy'
    ? await publicClient.simulateContract({
      address: input.curve, abi: curveTradeAbi, account: input.account, functionName: 'buy',
      args: [amount, 0n, input.account], value: amount,
    })
    : await publicClient.simulateContract({
      address: input.curve, abi: curveTradeAbi, account: input.account, functionName: 'sell',
      args: [amount, 0n, input.account],
    });
  const quote = quoteRequest.result;
  const slippageBps = input.slippageBps ?? 100n;
  const minimum = quote * (10_000n - slippageBps) / 10_000n;

  if (input.type === 'buy') {
    const request = await publicClient.simulateContract({
      address: input.curve, abi: curveTradeAbi, account: input.account, functionName: 'buy',
      args: [amount, minimum, input.account], value: amount,
    })
    const hash = await walletClient.writeContract(request.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Pons V2 buy transaction reverted.');
    return { hash, quote };
  }

  const request = await publicClient.simulateContract({
      address: input.curve, abi: curveTradeAbi, account: input.account, functionName: 'sell',
      args: [amount, minimum, input.account],
    });
  const hash = await walletClient.writeContract(request.request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Pons V2 sell transaction reverted.');
  return { hash, quote };
}

export async function getPonsV2TokensLaunchedBy(account: Address): Promise<PonsV2Launch[]> {
  const cacheKey = account.toLowerCase();
  const cached = launchesByAccountCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingLaunchesByAccount.get(cacheKey);
  if (pending) return pending;
  const request = loadPonsV2TokensLaunchedBy(account).then((value) => {
    launchesByAccountCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    persistLaunches(account, value);
    pendingLaunchesByAccount.delete(cacheKey);
    return value;
  }, (error) => {
    pendingLaunchesByAccount.delete(cacheKey);
    const stale = launchesByAccountCache.get(cacheKey);
    if (stale) return stale.value;
    const persisted = readPersistedLaunches(account);
    if (persisted) return persisted;
    throw error;
  });
  pendingLaunchesByAccount.set(cacheKey, request);
  return request;
}

async function loadPonsV2TokensLaunchedBy(account: Address): Promise<PonsV2Launch[]> {
  const deploymentBlock = BigInt(import.meta.env.VITE_PONS_V2_DEPLOYMENT_BLOCK || '26841846');
  const topic0 = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
  const explorerUrl = new URL('https://robinhoodchain.blockscout.com/api');
  explorerUrl.searchParams.set('module', 'logs');
  explorerUrl.searchParams.set('action', 'getLogs');
  explorerUrl.searchParams.set('address', PONS_V2_FACTORY);
  explorerUrl.searchParams.set('topic0', topic0);
  explorerUrl.searchParams.set('topic3', `0x${account.slice(2).padStart(64, '0')}`);
  explorerUrl.searchParams.set('fromBlock', deploymentBlock.toString());
  explorerUrl.searchParams.set('toBlock', 'latest');

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(explorerUrl, { signal: controller.signal });
    window.clearTimeout(timeout);
    if (response.ok) {
      const payload = await response.json() as {
        status?: string;
        result?: Array<{ topics?: string[]; data?: string }>;
      };
      if (payload.status === '1' && Array.isArray(payload.result)) {
        const target = account.slice(2).toLowerCase();
        return payload.result.filter((log) => (
          log.topics?.[3]?.slice(-40).toLowerCase() === target
        )).flatMap((log) => {
          const topics = log.topics || [];
          const data = (log.data || '').replace(/^0x/, '');
          if (topics.length < 4 || data.length < 192) return [];
          return [{
            token: `0x${topics[1].slice(-40)}` as Address,
            curve: `0x${topics[2].slice(-40)}` as Address,
            deployer: `0x${topics[3].slice(-40)}` as Address,
            pairToken: `0x${data.slice(24, 64)}` as Address,
            launchConfigId: BigInt(`0x${data.slice(64, 128)}`),
            graduationThreshold: BigInt(`0x${data.slice(128, 192)}`),
          }];
        });
      }

    }
  } catch {
    // Fall through to the RPC path when the explorer API is unavailable.
  }

  let latestBlock: bigint;
  try {
    latestBlock = await publicClient.getBlockNumber();
  } catch {
    // Do not turn a temporary RPC outage into a broken profile. The explorer
    // result is authoritative when available; otherwise return an empty
    // result and let the user retry without flooding the RPC.
    return readPersistedLaunches(account) || [];
  }
  const allLogs: Awaited<ReturnType<typeof publicClient.getLogs>> = [];

  const getLogsInRange = async (fromBlock: bigint, toBlock: bigint): Promise<typeof allLogs> => {
    try {
      return await publicClient.getLogs({
        address: PONS_V2_FACTORY,
        event: factoryAbi[0],
        args: { deployer: account },
        fromBlock,
        toBlock,
      });
    } catch (error) {
      if (toBlock - fromBlock < 1_000n) throw error;
      const midpoint = fromBlock + (toBlock - fromBlock) / 2n;
      // Keep fallback scans sequential. Parallel recursive requests can flood
      // the public RPC and make the browser/network unresponsive.
      const left = await getLogsInRange(fromBlock, midpoint);
      const right = await getLogsInRange(midpoint + 1n, toBlock);
      return [...left, ...right];
    }
  };

  // The deployer topic is highly selective, so try one indexed query first.
  // If the RPC rejects the range, getLogsInRange recursively narrows it.
  try {
    allLogs.push(...await getLogsInRange(deploymentBlock, latestBlock));
  } catch {
    return readPersistedLaunches(account) || [];
  }

  return allLogs.flatMap((log) => (
    'args' in log && log.args ? [log.args as PonsV2Launch] : []
  ));
}

export async function getPonsV2PlatformLaunches(maxResults = 500): Promise<PonsV2Launch[]> {
  const deploymentBlock = BigInt(import.meta.env.VITE_PONS_V2_DEPLOYMENT_BLOCK || '26841846');
  const launchTopic = '0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
  const decodeV2Logs = (items: Array<{
    block_number?: number;
    timestamp?: string;
    topics?: string[];
    data?: string;
    decoded?: {
      method_id?: string;
      parameters?: Array<{ name?: string; value?: string }>;
    };
  }>): PonsV2Launch[] => items.flatMap((item) => {
    if (item.decoded?.method_id === launchTopic.slice(2, 10) && item.decoded.parameters) {
      const values = Object.fromEntries(item.decoded.parameters.map((parameter) => [parameter.name, parameter.value]));
      if (values.token && values.curve && values.deployer && values.pairToken !== undefined && values.launchConfigId !== undefined && values.graduationThreshold !== undefined) {
        return [{
          token: values.token as Address,
          curve: values.curve as Address,
          deployer: values.deployer as Address,
          pairToken: values.pairToken as Address,
          launchConfigId: BigInt(values.launchConfigId),
          graduationThreshold: BigInt(values.graduationThreshold),
          createdAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
        }];
      }
    }
    const topics = item.topics || [];
    const data = (item.data || '').replace(/^0x/, '');
    if (topics[0] !== launchTopic || topics.length < 4 || data.length < 192) return [];
    return [{
      token: `0x${topics[1].slice(-40)}` as Address,
      curve: `0x${topics[2].slice(-40)}` as Address,
      deployer: `0x${topics[3].slice(-40)}` as Address,
      pairToken: `0x${data.slice(24, 64)}` as Address,
      launchConfigId: BigInt(`0x${data.slice(64, 128)}`),
      graduationThreshold: BigInt(`0x${data.slice(128, 192)}`),
      createdAt: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
    }];
  });

  // Blockscout's v2 endpoint is paginated and remains reliable when the
  // legacy logs endpoint is rate-limited.
  try {
    const launches: PonsV2Launch[] = [];
    let nextParams: Record<string, string> | undefined;
    for (let page = 0; page < Math.ceil(maxResults / 50); page += 1) {
      const url = new URL('/api/pons/launches', window.location.origin);
      url.searchParams.set('items_count', '50');
      if (nextParams) {
        Object.entries(nextParams).forEach(([key, value]) => url.searchParams.set(key, value));
      }
      const response = await fetch(url);
      if (!response.ok) break;
      const payload = await response.json() as {
        items?: Array<{ block_number?: number; topics?: string[]; data?: string; decoded?: { method_id?: string; parameters?: Array<{ name?: string; value?: string }> } }>;
        next_page_params?: Record<string, string>;
      };
      const pageLaunches = decodeV2Logs(payload.items || []);
      launches.push(...pageLaunches);
      if (!payload.next_page_params) break;
      nextParams = payload.next_page_params;
    }
    const unique = new Map<string, PonsV2Launch>();
    launches.forEach((launch) => unique.set(launch.token!.toLowerCase(), launch));
    if (unique.size > 0) return [...unique.values()].slice(0, maxResults);
  } catch {
    // Continue to the legacy explorer/RPC fallbacks below.
  }

  const decodeLaunchLogs = (logs: Array<{ topics?: string[]; data?: string }>): PonsV2Launch[] => logs.flatMap((log) => {
    const topics = log.topics || [];
    const data = (log.data || '').replace(/^0x/, '');
    if (topics.length < 4 || data.length < 192) return [];
    return [{
      token: `0x${topics[1].slice(-40)}` as Address,
      curve: `0x${topics[2].slice(-40)}` as Address,
      deployer: `0x${topics[3].slice(-40)}` as Address,
      pairToken: `0x${data.slice(24, 64)}` as Address,
      launchConfigId: BigInt(`0x${data.slice(64, 128)}`),
      graduationThreshold: BigInt(`0x${data.slice(128, 192)}`),
    }];
  });

  try {
    const url = new URL('https://robinhoodchain.blockscout.com/api');
    url.searchParams.set('module', 'logs');
    url.searchParams.set('action', 'getLogs');
    url.searchParams.set('address', PONS_V2_FACTORY);
    url.searchParams.set('topic0', launchTopic);
    url.searchParams.set('fromBlock', deploymentBlock.toString());
    url.searchParams.set('toBlock', 'latest');
    const response = await fetch(url);
    if (response.ok) {
      const payload = await response.json() as { status?: string; result?: Array<{ topics?: string[]; data?: string }> };
      if (payload.status === '1' && Array.isArray(payload.result)) {
        const launches = decodeLaunchLogs(payload.result);
        if (launches.length > 0) return launches;
      }
    }
  } catch {
    // Use the chain RPC below when the explorer is unavailable or rate-limited.
  }

  const latestBlock = await publicClient.getBlockNumber();
  // Keep the RPC fallback bounded and split into provider-safe ranges. A
  // failed explorer request must not make Explore scan the entire chain.
  const recentFromBlock = latestBlock > 2_000_000n ? latestBlock - 2_000_000n : deploymentBlock;
  const chunkSize = 100_000n;
  const ranges: Array<[bigint, bigint]> = [];
  for (let from = recentFromBlock; from <= latestBlock; from += chunkSize) {
    ranges.push([from, from + chunkSize - 1n > latestBlock ? latestBlock : from + chunkSize - 1n]);
  }
  const results = await Promise.allSettled(ranges.map(([fromBlock, toBlock]) => publicClient.getLogs({
    address: PONS_V2_FACTORY,
    event: factoryAbi[0],
    fromBlock,
    toBlock,
  })));
  const logs = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  return logs.flatMap((log) => {
    if (!('args' in log) || !log.args || Array.isArray(log.args)) return [];
    const args = log.args as Record<string, unknown>;
    return [{
      token: args.token as Address,
      curve: args.curve as Address,
      deployer: args.deployer as Address,
      pairToken: args.pairToken as Address,
      launchConfigId: args.launchConfigId as bigint,
      graduationThreshold: args.graduationThreshold as bigint,
    }];
  });
}

export async function getPonsV2CreatorFees(account: Address) {
  const escrow = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow' });
  const balance = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: 'balanceOf', args: [account] });
  return { escrow, balance, quoteAsset: zeroAddress, tokenBalance: 0n };
}

export async function getPonsV2CreatorFeesForAsset(account: Address, quoteAsset: Address) {
  const escrow = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow' });
  const [balance, tokenBalance] = await Promise.all([
    publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: 'balanceOf', args: [account] }),
    quoteAsset === zeroAddress
      ? Promise.resolve(0n)
      : publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: 'balanceOfToken', args: [account, quoteAsset] }),
  ]);
  return { escrow, balance, quoteAsset, tokenBalance };
}

export type PonsV2CreatorAssetBalance = {
  asset: Address;
  balance: bigint;
};

export async function getPonsV2FeeAssetMetadata(asset: Address) {
  if (asset.toLowerCase() === zeroAddress.toLowerCase()) return { symbol: 'ETH', decimals: 18 };
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'symbol' }),
    publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'decimals' }),
  ]);
  return { symbol, decimals };
}

export async function getPonsV2AllCreatorFeeBalances(account: Address) {
  const escrow = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow' });
  const nativeBalance = await publicClient.readContract({
    address: escrow, abi: escrowAbi, functionName: 'balanceOf', args: [account],
  });
  const launches = await getPonsV2TokensLaunchedBy(account);
  const assets = new Map<string, Address>();

  for (let index = 0; index < launches.length; index += 4) {
    const batch = launches.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map(async (launch) => {
      if (!launch.token) return null;
      const state = await publicClient.readContract({
        address: PONS_V2_FACTORY,
        abi: factoryAbi,
        functionName: 'getLaunchedToken',
        args: [launch.token],
      });
      if (state.creatorFeeRecipient.toLowerCase() !== account.toLowerCase()) return null;
      return [state.pairToken, launch.token] as const;
    }));
    results.forEach((result) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      result.value.forEach((asset) => {
        if (asset !== zeroAddress) assets.set(asset.toLowerCase(), asset);
      });
    });
  }

  const tokenBalances = await Promise.all([...assets.values()].map(async (asset) => ({
    asset,
    balance: await publicClient.readContract({
      address: escrow, abi: escrowAbi, functionName: 'balanceOfToken', args: [account, asset],
    }),
  })));

  return { escrow, nativeBalance, tokenBalances };
}

export async function getPonsV2CreatorFeeBalancesForAssets(account: Address, assets: Address[]) {
  const escrow = await publicClient.readContract({
    address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow',
  });
  const uniqueAssets = new Map(assets.map((asset) => [asset.toLowerCase(), asset]));
  const nativeBalance = uniqueAssets.has(zeroAddress.toLowerCase())
    ? await publicClient.readContract({
        address: escrow, abi: escrowAbi, functionName: 'balanceOf', args: [account],
      })
    : 0n;
  const tokenBalances = await Promise.all(
    [...uniqueAssets.values()]
      .filter((asset) => asset.toLowerCase() !== zeroAddress.toLowerCase())
      .map(async (asset) => ({
        asset,
        balance: await publicClient.readContract({
          address: escrow, abi: escrowAbi, functionName: 'balanceOfToken', args: [account, asset],
        }),
      })),
  );
  return { escrow, nativeBalance, tokenBalances };
}

type Recent24hBlockRange = { fromBlock: bigint; toBlock: bigint; expiresAt: number };
let recent24hBlockRange: Recent24hBlockRange | undefined;
let pending24hBlockRange: Promise<Recent24hBlockRange> | undefined;
const tokenVolumeCache = new Map<string, {
  expiresAt: number;
  value: Awaited<ReturnType<typeof loadPonsV2TokenVolume24h>>;
}>();
const pendingTokenVolumes = new Map<string, Promise<Awaited<ReturnType<typeof loadPonsV2TokenVolume24h>>>>();

async function getRecent24hBlockRange(): Promise<Recent24hBlockRange> {
  if (recent24hBlockRange && recent24hBlockRange.expiresAt > Date.now()) return recent24hBlockRange;
  if (pending24hBlockRange) return pending24hBlockRange;
  pending24hBlockRange = (async () => {
    const latest = await publicClient.getBlock({ blockTag: 'latest' });
    const cutoff = latest.timestamp - 24n * 60n * 60n;
    let low = 0n;
    let high = latest.number;
    while (low < high) {
      const middle = (low + high) / 2n;
      const block = await publicClient.getBlock({ blockNumber: middle });
      if (block.timestamp < cutoff) low = middle + 1n;
      else high = middle;
    }
    const range = { fromBlock: low, toBlock: latest.number, expiresAt: Date.now() + 5 * 60 * 1000 };
    recent24hBlockRange = range;
    return range;
  })().finally(() => {
    pending24hBlockRange = undefined;
  });
  return pending24hBlockRange;
}

async function loadPonsV2TokenVolume24h(token: Address) {
  const details = await getPonsV2TokenDetails(token);
  const range = await getRecent24hBlockRange();
  const [buyLogs, sellLogs] = await Promise.all([
    getLogsInRanges(details.curve, [CURVE_BUY_TOPIC], range.fromBlock, range.toBlock),
    getLogsInRanges(details.curve, [CURVE_SELL_TOPIC], range.fromBlock, range.toBlock),
  ]);
  let volumeQuote = 0n;
  for (const log of buyLogs) {
    const event = decodeEventLog({
      abi: curveTradeEventsAbi,
      data: log.data,
      topics: mutableLogTopics(log),
    });
    if (event.eventName === 'CurveBuy') volumeQuote += event.args.quoteIn;
  }
  for (const log of sellLogs) {
    const event = decodeEventLog({
      abi: curveTradeEventsAbi,
      data: log.data,
      topics: mutableLogTopics(log),
    });
    if (event.eventName === 'CurveSell') volumeQuote += event.args.quoteOut;
  }
  const quoteAsset = details.launch.pairToken;
  const metadata = quoteAsset.toLowerCase() === zeroAddress.toLowerCase()
    ? { symbol: 'ETH', decimals: 18 }
    : await getPonsV2FeeAssetMetadata(quoteAsset);
  return {
    token,
    curve: details.curve,
    quoteAsset,
    quoteSymbol: metadata.symbol,
    quoteDecimals: metadata.decimals,
    trades24h: buyLogs.length + sellLogs.length,
    volumeRaw: volumeQuote,
    volume: formatUnits(volumeQuote, metadata.decimals),
  };
}

export async function getPonsV2TokenVolume24h(token: Address) {
  const key = token.toLowerCase();
  const cached = tokenVolumeCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingTokenVolumes.get(key);
  if (pending) return pending;
  const request = loadPonsV2TokenVolume24h(token).then((value) => {
    tokenVolumeCache.set(key, { expiresAt: Date.now() + 5 * 60 * 1000, value });
    pendingTokenVolumes.delete(key);
    return value;
  }, (error) => {
    pendingTokenVolumes.delete(key);
    throw error;
  });
  pendingTokenVolumes.set(key, request);
  return request;
}

export type PonsV2TokenFeeHistory = {
  token: Address;
  creator: Address;
  asset: Address;
  earned: bigint;
  pendingSweep: bigint;
  credited: bigint;
  claimed: bigint;
  remaining: bigint;
  fromBlock: bigint;
  throughBlock: bigint;
};

function addressTopic(address: Address): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, '0')}` as Hex;
}

function mutableLogTopics(log: { topics: readonly Hex[] }): [Hex, ...Hex[]] {
  const [signature, ...indexedTopics] = log.topics;
  if (!signature) throw new Error('Malformed event log has no signature topic.');
  return [signature, ...indexedTopics];
}

async function getLogsInRanges(
  address: Address,
  topics: [Hex, ...Hex[]],
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs: Array<{ topics: readonly Hex[]; data: Hex; blockNumber: bigint | null }> = [];
  const rangeSize = 5_000_000n;
  const readRange = async (from: bigint, to: bigint) => {
    try {
      const rpcTopics: [Hex, ...Hex[]] = [topics[0], ...topics.slice(1)];
      const result = await publicClient.request({
        method: 'eth_getLogs',
        params: [{
          address,
          topics: rpcTopics,
          fromBlock: toHex(from),
          toBlock: toHex(to),
        }],
      });
      logs.push(...result.map((log) => ({
        topics: log.topics,
        data: log.data,
        blockNumber: log.blockNumber ? BigInt(log.blockNumber) : null,
      })));
    } catch (error) {
      if (to - from < 10_000n) throw error;
      const middle = from + (to - from) / 2n;
      await readRange(from, middle);
      await readRange(middle + 1n, to);
    }
  };
  for (let from = fromBlock; from <= toBlock; from += rangeSize) {
    const to = from + rangeSize - 1n > toBlock ? toBlock : from + rangeSize - 1n;
    await readRange(from, to);
  }
  return logs;
}

const tokenFeeHistoryCache = new Map<string, { expiresAt: number; value: PonsV2TokenFeeHistory }>();
const pendingTokenFeeHistories = new Map<string, Promise<PonsV2TokenFeeHistory>>();
const TOKEN_FEE_HISTORY_CACHE_TTL_MS = 45_000;

async function loadPonsV2TokenFeeHistory(token: Address, knownLaunchBlock?: number): Promise<PonsV2TokenFeeHistory> {
  const deploymentBlock = BigInt(import.meta.env?.VITE_PONS_V2_DEPLOYMENT_BLOCK || '26841846');
  const throughBlock = await publicClient.getBlockNumber();
  let launchBlock = knownLaunchBlock && knownLaunchBlock > 0 ? BigInt(knownLaunchBlock) : null;
  if (launchBlock === null) {
    const launchLogs = await getLogsInRanges(
      PONS_V2_FACTORY,
      [TOKEN_LAUNCHED_TOPIC, addressTopic(token)],
      deploymentBlock,
      throughBlock,
    );
    launchBlock = launchLogs.reduce<bigint | null>(
      (first, log) => log.blockNumber !== null && (first === null || log.blockNumber < first) ? log.blockNumber : first,
      null,
    );
  }
  if (launchBlock === null) throw new Error('Could not find the token launch event on Robinhood Chain.');

  const details = await getPonsV2TokenDetails(token);
  const creator = details.launch.creatorFeeRecipient;
  const asset = details.launch.pairToken;
  const escrow = await publicClient.readContract({
    address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow',
  });
  const recipientTopic = addressTopic(creator);
  const isNative = asset.toLowerCase() === zeroAddress.toLowerCase();
  const [curveBuys, curveSells, curveFees, poolRegistrations, creditLogs, claimLogs] = await Promise.all([
    getLogsInRanges(details.curve, [CURVE_BUY_TOPIC], launchBlock, throughBlock),
    getLogsInRanges(details.curve, [CURVE_SELL_TOPIC], launchBlock, throughBlock),
    getLogsInRanges(details.curve, [FEES_SWEPT_TOPIC], launchBlock, throughBlock),
    getLogsInRanges(PONS_V2_MEME_HOOK, [POOL_REGISTERED_TOPIC], launchBlock, throughBlock),
    getLogsInRanges(
      escrow,
      isNative
        ? [CREDITED_TOPIC, recipientTopic]
        : [CREDITED_TOKEN_TOPIC, recipientTopic, addressTopic(asset)],
      launchBlock,
      throughBlock,
    ),
    getLogsInRanges(
      escrow,
      isNative
        ? [CLAIMED_TOPIC, recipientTopic]
        : [CLAIMED_TOKEN_TOPIC, recipientTopic, addressTopic(asset)],
      launchBlock,
      throughBlock,
    ),
  ]);

  let curveTaxEarned = 0n;
  [...curveBuys, ...curveSells].forEach((log) => {
    const decoded = decodeEventLog({
      abi: curveTradeEventsAbi,
      data: log.data,
      topics: mutableLogTopics(log),
    });
    curveTaxEarned += decoded.args.tax;
  });

  let curveCreatorAmountSwept = 0n;
  curveFees.forEach((log) => {
    const decoded = decodeEventLog({ abi: curveFeeEventsAbi, data: log.data, topics: mutableLogTopics(log) });
    if (decoded.eventName === 'FeesSwept') curveCreatorAmountSwept += decoded.args.creatorAmount;
  });

  const poolIds = poolRegistrations.flatMap((log) => {
    const decoded = decodeEventLog({ abi: hookFeeEventsAbi, data: log.data, topics: mutableLogTopics(log) });
    return decoded.eventName === 'PoolRegistered' && decoded.args.memecoin.toLowerCase() === token.toLowerCase()
      ? [decoded.args.poolId]
      : [];
  });
  const poolFeeLogs = await Promise.all(poolIds.map((poolId) => (
    getLogsInRanges(PONS_V2_MEME_HOOK, [POOL_FEES_SWEPT_TOPIC, poolId], launchBlock, throughBlock)
  )));
  let poolCreatorFeesEarned = 0n;
  poolFeeLogs.flat().forEach((log) => {
    const decoded = decodeEventLog({ abi: hookFeeEventsAbi, data: log.data, topics: mutableLogTopics(log) });
    if (decoded.eventName === 'PoolFeesSwept') poolCreatorFeesEarned += decoded.args.creatorAmount;
  });

  const amountFromLog = (log: { data: Hex; topics: readonly Hex[] }, eventName: string): bigint => {
    if (eventName === 'Credited') {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: mutableLogTopics(log) });
      return decoded.eventName === 'Credited' ? decoded.args.amount : 0n;
    }
    if (eventName === 'CreditedToken') {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: mutableLogTopics(log) });
      return decoded.eventName === 'CreditedToken' ? decoded.args.amount : 0n;
    }
    if (eventName === 'Claimed') {
      const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: mutableLogTopics(log) });
      return decoded.eventName === 'Claimed' ? decoded.args.amount : 0n;
    }
    const decoded = decodeEventLog({ abi: escrowAbi, data: log.data, topics: mutableLogTopics(log) });
    return decoded.eventName === 'ClaimedToken' ? decoded.args.amount : 0n;
  };
  const credited = creditLogs.reduce((sum, log) => sum + amountFromLog(log, isNative ? 'Credited' : 'CreditedToken'), 0n);
  const claimed = claimLogs.reduce((sum, log) => sum + amountFromLog(log, isNative ? 'Claimed' : 'ClaimedToken'), 0n);
  const remainingBalances = await getPonsV2CreatorFeeBalancesForAssets(creator, [asset]);
  const remaining = isNative
    ? remainingBalances.nativeBalance
    : remainingBalances.tokenBalances.find((entry) => entry.asset.toLowerCase() === asset.toLowerCase())?.balance || 0n;

  const earned = curveTaxEarned + poolCreatorFeesEarned;
  const pendingSweep = curveTaxEarned > curveCreatorAmountSwept
    ? curveTaxEarned - curveCreatorAmountSwept
    : 0n;
  return { token, creator, asset, earned, pendingSweep, credited, claimed, remaining, fromBlock: launchBlock, throughBlock };
}

export async function getPonsV2TokenFeeHistory(
  token: Address,
  knownLaunchBlock?: number,
  forceRefresh = false,
): Promise<PonsV2TokenFeeHistory> {
  const key = `${token.toLowerCase()}:${knownLaunchBlock || 'unknown'}`;
  const cached = tokenFeeHistoryCache.get(key);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingTokenFeeHistories.get(key);
  if (pending) {
    if (!forceRefresh) return pending;
    await pending.catch(() => undefined);
  }
  const request = loadPonsV2TokenFeeHistory(token, knownLaunchBlock)
    .then((value) => {
      tokenFeeHistoryCache.set(key, { expiresAt: Date.now() + TOKEN_FEE_HISTORY_CACHE_TTL_MS, value });
      return value;
    })
    .finally(() => pendingTokenFeeHistories.delete(key));
  pendingTokenFeeHistories.set(key, request);
  return request;
}

export async function claimPonsV2CreatorFeesForAssets(account: Address, assets: Address[]): Promise<Hex[]> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to claim creator fees.');
  const { escrow, nativeBalance, tokenBalances } = await getPonsV2CreatorFeeBalancesForAssets(account, assets);
  const walletClient = createWalletClient({ account, chain: ROBINHOOD_CHAIN, transport: custom(provider) });
  const hashes: Hex[] = [];
  if (nativeBalance > 0n) {
    const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim' });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Native creator fee claim reverted.');
    hashes.push(hash);
  }
  for (const entry of tokenBalances) {
    if (entry.balance <= 0n) continue;
    const hash = await walletClient.writeContract({
      address: escrow, abi: escrowAbi, functionName: 'claimToken', args: [entry.asset],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`Creator fee claim for ${entry.asset} reverted.`);
    hashes.push(hash);
  }
  if (hashes.length === 0) throw new Error('No claimable creator fees found for this token.');
  return hashes;
}

export async function claimPonsV2CreatorFees(account: Address, quoteAsset?: Address): Promise<Hex[]> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to claim creator fees.');
  const escrow = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: factoryAbi, functionName: 'feeEscrow' });
  const walletClient = createWalletClient({ account, chain: ROBINHOOD_CHAIN, transport: custom(provider) });
  const hashes: Hex[] = [];
  const nativeBalance = await publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: 'balanceOf', args: [account] });
  if (nativeBalance > 0n) {
    const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim' });
    await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  if (quoteAsset && quoteAsset !== zeroAddress) {
    const tokenBalance = await publicClient.readContract({
      address: escrow, abi: escrowAbi, functionName: 'balanceOfToken', args: [account, quoteAsset],
    });
    if (tokenBalance > 0n) {
      const hash = await walletClient.writeContract({
        address: escrow, abi: escrowAbi, functionName: 'claimToken', args: [quoteAsset],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      hashes.push(hash);
    }
  }
  if (hashes.length === 0) throw new Error('No claimable creator fees found.');
  return hashes;
}

export async function claimAllPonsV2CreatorFees(account: Address): Promise<Hex[]> {
  const { escrow, nativeBalance, tokenBalances } = await getPonsV2AllCreatorFeeBalances(account);
  const provider = getInjectedProvider();
  if (!provider) throw new Error('A browser wallet is required to claim creator fees.');
  const walletClient = createWalletClient({ account, chain: ROBINHOOD_CHAIN, transport: custom(provider) });
  const hashes: Hex[] = [];
  if (nativeBalance > 0n) {
    const hash = await walletClient.writeContract({ address: escrow, abi: escrowAbi, functionName: 'claim' });
    await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  for (const entry of tokenBalances) {
    if (entry.balance <= 0n) continue;
    const hash = await walletClient.writeContract({
      address: escrow, abi: escrowAbi, functionName: 'claimToken', args: [entry.asset],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
  }
  if (hashes.length === 0) throw new Error('No claimable creator fees found.');
  return hashes;
}
