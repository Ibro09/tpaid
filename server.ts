import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createPrivateKey, createSign } from 'node:crypto';
import { createPublicClient, decodeEventLog, http, type Address, type Hex } from 'viem';
import { MongoClient, type Collection } from 'mongodb';
import { WebSocketServer, WebSocket } from 'ws';
import {
  getPonsV2FeeAssetMetadata,
  getPonsV2TokenFeeHistory,
} from './src/utils/ponsV2.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '2mb' }));

const ROBINHOOD_RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_SERVER_CHAIN = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Robinhood ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ROBINHOOD_RPC_URL] } },
} as const;
const PONS_V2_FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e' as Address;
const serverChainClient = createPublicClient({
  chain: ROBINHOOD_SERVER_CHAIN,
  transport: http(ROBINHOOD_RPC_URL, { timeout: 15_000, retryCount: 0 }),
});
const feeEscrowAddressAbi = [{
  type: 'function',
  name: 'feeEscrow',
  stateMutability: 'view',
  inputs: [],
  outputs: [{ type: 'address' }],
}] as const;
const creatorFeeClaimEventsAbi = [
  { type: 'event', name: 'Claimed', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'ClaimedToken', inputs: [
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'token', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
  ] },
] as const;
const allowedRobinhoodRpcMethods = new Set([
  'eth_call',
  'eth_blockNumber',
  'eth_chainId',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockReceipts',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getFilterChanges',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  'eth_uninstallFilter',
  'net_version',
  'web3_clientVersion',
]);

app.post('/api/robinhood-rpc', async (request, response) => {
  const body: unknown = request.body;
  const payloads = Array.isArray(body) ? body : [body];
  if (payloads.length === 0 || payloads.length > 100 || payloads.some((payload) => (
    !payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof (payload as Record<string, unknown>).method !== 'string'
    || !allowedRobinhoodRpcMethods.has((payload as Record<string, unknown>).method as string)
  ))) {
    response.status(400).json({ error: 'Invalid or unsupported Robinhood RPC request.' });
    return;
  }
  try {
    const upstream = await fetch(ROBINHOOD_RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await upstream.text();
    response.status(upstream.status).type('application/json').send(result);
  } catch (error) {
    console.error('Robinhood RPC proxy failed:', error);
    response.status(502).json({ error: error instanceof Error ? error.message : 'Robinhood RPC request failed.' });
  }
});

type ExploreToken = {
  id: string;
  source: 'tipped-launch';
  factoryAddress: string;
  rank: number;
  name: string;
  ticker: string;
  creatorHandle: string;
  creatorName: string;
  creatorAvatar: string;
  creatorAddress?: string;
  creatorFeeRecipient?: string;
  imageUrl: string;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  age: string;
  description?: string;
  totalFeesPaid: number;
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
  createdAt: number;
  updatedAt: number;
  launchBlock?: number;
};

let tokenCollection: Collection<ExploreToken> | undefined;
type CreatorFeeClaim = {
  claimId: string;
  creatorAddress: string;
  creatorHandle: string;
  creatorName: string;
  amountWei: string;
  amountEth: number;
  amounts?: Array<{ asset: string; amountRaw: string }>;
  tokenAddress?: string;
  txHashes: string[];
  claimedAt: number;
};
let claimCollection: Collection<CreatorFeeClaim> | undefined;
const exploreSockets = new Set<WebSocket>();
let mongoClient: MongoClient | undefined;
const tokenDetailsCache = new Map<string, { expiresAt: number; value: Record<string, unknown> }>();
const TOKEN_DETAILS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getTokenCollection(): Promise<Collection<ExploreToken>> {
  if (tokenCollection) return tokenCollection;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MongoDB is not configured. Add MONGODB_URI to .env.');
  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  tokenCollection = mongoClient.db(process.env.MONGODB_DB || 'tipped').collection<ExploreToken>('explore_tokens');
  await tokenCollection.createIndex({ id: 1 }, { unique: true });
  await tokenCollection.createIndex({ updatedAt: -1 });
  return tokenCollection;
}

async function getClaimCollection(): Promise<Collection<CreatorFeeClaim>> {
  if (claimCollection) return claimCollection;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MongoDB is not configured. Add MONGODB_URI to .env.');
  if (!mongoClient) {
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
  }
  claimCollection = mongoClient.db(process.env.MONGODB_DB || 'tipped').collection<CreatorFeeClaim>('creator_fee_claims');
  await claimCollection.createIndex({ claimId: 1 }, { unique: true });
  await claimCollection.createIndex({ creatorHandle: 1 });
  return claimCollection;
}

type GoogleSheetTokenRow = {
  id: string;
  values: string[];
};

let googleAccessToken: { value: string; expiresAt: number } | undefined;

function googleSheetsConfig() {
  const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_DOCS_DOCUMENT_ID)
    ?.trim()
    .replace(/^["']+|["']+$/g, '');
  let serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    ?.trim()
    .replace(/^[\s"']+|[\s"',;]+$/g, '');
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (privateKey?.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  } else if (privateKey?.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1);
  }

  if (privateKey?.startsWith('{')) {
    try {
      const serviceAccount = JSON.parse(privateKey) as { client_email?: string; private_key?: string };
      privateKey = serviceAccount.private_key;
      serviceAccountEmail ||= serviceAccount.client_email;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY looks like JSON but is not valid service-account JSON.');
    }
  }

  privateKey = privateKey
    ?.replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const pemBlock = privateKey?.match(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/,
  )?.[0];
  if (pemBlock) privateKey = pemBlock;

  if (!spreadsheetId || !serviceAccountEmail || !privateKey) return null;
  if (!/^[a-z0-9][a-z0-9-]*@[a-z0-9-]+\.iam\.gserviceaccount\.com$/i.test(serviceAccountEmail)) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL must be the service account client_email (name@project.iam.gserviceaccount.com), with no surrounding quotes or commas.');
  }
  return { spreadsheetId, serviceAccountEmail, privateKey };
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

async function getGoogleSheetsAccessToken(): Promise<string> {
  const config = googleSheetsConfig();
  if (!config) throw new Error('Google Sheets is not configured. Set the spreadsheet ID and service-account credentials in .env.');
  if (googleAccessToken && googleAccessToken.expiresAt > Date.now() + 60_000) return googleAccessToken.value;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: config.serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  let signingKey;
  try {
    signingKey = createPrivateKey(config.privateKey);
  } catch {
    throw new Error('Google service-account private key could not be parsed. Set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to the service account JSON "private_key" value, preserving PEM headers and newlines (literal \\n is supported).');
  }
  const assertion = `${signingInput}.${signer.sign(signingKey, 'base64url')}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokenPayload = await tokenResponse.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || `Google authentication failed (${tokenResponse.status}).`);
  }
  googleAccessToken = {
    value: tokenPayload.access_token,
    expiresAt: Date.now() + Number(tokenPayload.expires_in || 3600) * 1000,
  };
  return googleAccessToken.value;
}

async function googleSheetsRequest<T>(method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown): Promise<T> {
  const accessToken = await getGoogleSheetsAccessToken();
  const result = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!result.ok) {
    const detail = (await result.text()).slice(0, 500);
    throw new Error(`Google Sheets API failed (${result.status}): ${detail}`);
  }
  return await result.json() as T;
}

type GoogleSheetMetadata = {
  properties?: { title?: string };
  sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
};

type GoogleSheetValues = { values?: unknown[][] };

const GOOGLE_TOKEN_SHEET_NAME = 'Tipped Tokens';
const GOOGLE_TOKEN_SHEET_HEADERS = [
  'Token Address',
  'Token Name',
  'Ticker',
  'Creator Name',
  'Creator Handle',
  'Creator Wallet',
  'Description',
  'Image URL',
  'Launch Date',
  'Launch Block',
  'Launch Transaction',
  'Fee Asset',
  'Fee Earned (token snapshot)',
  'Unswept Curve Tax (token-specific)',
  'Fee Credited (wallet/asset since launch)',
  'Fee Claimed (verified wallet claims by asset)',
  'Fee Remaining (wallet/asset snapshot)',
  'Verified Claim Transaction Hashes',
  'Fee Snapshot Captured At',
  'Last Updated',
  'Creator Fee Recipient',
];

function cleanSheetValue(value: string | undefined): string {
  return (value || 'Not provided').replace(/[\r\n\t]+/g, ' ').trim() || 'Not provided';
}

function formatNativeAmount(amountRaw: string): string {
  const amount = BigInt(amountRaw);
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function formatTokenAmount(amountRaw: string, decimals: number): string {
  const places = Math.max(0, Math.min(36, Math.floor(decimals)));
  const scale = 10n ** BigInt(places);
  const amount = BigInt(amountRaw);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(places, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function buildGoogleSheetRow(
  token: ExploreToken,
  claims: CreatorFeeClaim[],
): GoogleSheetTokenRow {
  const claimTotals = new Map<string, bigint>();
  claims.forEach((claim) => (claim.amounts || [{
    asset: '0x0000000000000000000000000000000000000000',
    amountRaw: claim.amountWei,
  }]).forEach((amount) => {
    const asset = amount.asset.toLowerCase();
    claimTotals.set(asset, (claimTotals.get(asset) || 0n) + BigInt(amount.amountRaw));
  }));
  const feeSnapshot = token.creatorFeeSnapshot;
  const feeDecimals = feeSnapshot?.decimals
    ?? (feeSnapshot?.asset === '0x0000000000000000000000000000000000000000' ? 18 : 0);
  const feeSymbol = feeSnapshot?.symbol
    || (feeSnapshot?.asset === '0x0000000000000000000000000000000000000000' ? 'ETH' : 'raw units');
  const claimedRows = [...claimTotals.entries()].map(([asset, amount]) => (
    asset === '0x0000000000000000000000000000000000000000'
      ? `  ETH: ${formatNativeAmount(amount.toString())} ETH`
      : `  ${asset}: ${amount.toString()} raw token units`
  ));
  const claimHashes = [...new Set(claims.flatMap((claim) => claim.txHashes))];
  return {
    id: token.id.toLowerCase(),
    values: [
      token.id,
      cleanSheetValue(token.name),
      cleanSheetValue(token.ticker),
      cleanSheetValue(token.creatorName),
      cleanSheetValue(token.creatorHandle),
      cleanSheetValue(token.creatorAddress),
      cleanSheetValue(token.description),
      cleanSheetValue(token.imageUrl),
      new Date(token.createdAt).toISOString(),
      String(token.launchBlock || 'Not recorded'),
      token.launchTxHash || 'Not recorded',
      feeSnapshot?.asset || 'Not recorded',
      feeSnapshot ? `${formatTokenAmount(feeSnapshot.earned, feeDecimals)} ${feeSymbol}` : 'No on-chain snapshot',
      feeSnapshot?.pendingSweep !== undefined
        ? `${formatTokenAmount(feeSnapshot.pendingSweep, feeDecimals)} ${feeSymbol}`
        : 'No on-chain snapshot',
      feeSnapshot ? `${formatTokenAmount(feeSnapshot.credited, feeDecimals)} ${feeSymbol}` : 'No on-chain snapshot',
      claimedRows.length ? claimedRows.join('\n') : 'No verified claim transactions recorded.',
      feeSnapshot ? `${formatTokenAmount(feeSnapshot.remaining, feeDecimals)} ${feeSymbol}` : 'No on-chain snapshot',
      claimHashes.length ? claimHashes.join('\n') : 'No verified claim transactions recorded.',
      feeSnapshot ? new Date(feeSnapshot.capturedAt).toISOString() : 'No on-chain snapshot',
      new Date().toISOString(),
      token.creatorFeeRecipient || token.creatorAddress || 'Not recorded',
    ],
  };
}

async function getGoogleTokenSheet(): Promise<{ title: string; spreadsheetUrl: string }> {
  const config = googleSheetsConfig();
  if (!config) throw new Error('Google Sheets is not configured. Add the spreadsheet ID and service-account credentials to .env.');
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}`;
  let spreadsheet = await googleSheetsRequest<GoogleSheetMetadata>(
    'GET',
    `${baseUrl}?fields=properties(title),sheets(properties(sheetId,title))`,
  );
  let sheet = spreadsheet.sheets?.find((entry) => entry.properties?.title === GOOGLE_TOKEN_SHEET_NAME);
  if (!sheet) {
    await googleSheetsRequest(
      'POST',
      `${baseUrl}:batchUpdate`,
      { requests: [{ addSheet: { properties: { title: GOOGLE_TOKEN_SHEET_NAME } } }] },
    );
    spreadsheet = await googleSheetsRequest<GoogleSheetMetadata>(
      'GET',
      `${baseUrl}?fields=properties(title),sheets(properties(sheetId,title))`,
    );
    sheet = spreadsheet.sheets?.find((entry) => entry.properties?.title === GOOGLE_TOKEN_SHEET_NAME);
  }
  if (!sheet?.properties?.title) throw new Error(`Unable to create or find the "${GOOGLE_TOKEN_SHEET_NAME}" tab.`);
  return {
    title: sheet.properties.title,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`,
  };
}

async function updateGoogleSheetRows(rowsToSync: GoogleSheetTokenRow[]): Promise<void> {
  if (rowsToSync.length === 0) return;
  const config = googleSheetsConfig();
  if (!config) throw new Error('Google Sheets is not configured. Add the spreadsheet ID and service-account credentials to .env.');
  const sheet = await getGoogleTokenSheet();
  const quotedTitle = `'${sheet.title.replace(/'/g, "''")}'`;
  const rangeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(`${quotedTitle}!A:U`)}`;
  const currentValues = await googleSheetsRequest<GoogleSheetValues>('GET', rangeUrl);
  const values = currentValues.values || [];
  const firstRow = values[0] || [];
  const hasHeader = firstRow[0] === GOOGLE_TOKEN_SHEET_HEADERS[0];
  if (firstRow.length > 0 && !hasHeader) {
    throw new Error(`The "${GOOGLE_TOKEN_SHEET_NAME}" tab already contains data with a different header; it was left unchanged.`);
  }
  const headerMatches = GOOGLE_TOKEN_SHEET_HEADERS.every((header, index) => firstRow[index] === header);
  const headerRow = headerMatches ? [] : [{ range: `${quotedTitle}!A1:U1`, values: [GOOGLE_TOKEN_SHEET_HEADERS] }];
  const dataStartRow = hasHeader ? 2 : 1;
  const rowByToken = new Map<string, number>();
  values.slice(hasHeader ? 1 : 0).forEach((row, index) => {
    if (typeof row[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(row[0])) {
      rowByToken.set(row[0].toLowerCase(), dataStartRow + index);
    }
  });
  const updates: Array<{ range: string; values: string[][] }> = [...headerRow];
  const additions: string[][] = [];
  rowsToSync.forEach((tokenRow) => {
    const rowNumber = rowByToken.get(tokenRow.id);
    if (rowNumber) {
      updates.push({ range: `${quotedTitle}!A${rowNumber}:U${rowNumber}`, values: [tokenRow.values] });
    } else {
      additions.push(tokenRow.values);
    }
  });
  if (updates.length) {
    await googleSheetsRequest(
      'POST',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values:batchUpdate`,
      { valueInputOption: 'RAW', data: updates },
    );
  }
  if (additions.length) {
    await googleSheetsRequest(
      'POST',
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(`${quotedTitle}!A:U`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { majorDimension: 'ROWS', values: additions },
    );
  }
}

async function syncGoogleSheetsCreatorTokens(creatorAddress: string): Promise<string> {
  if (!googleSheetsConfig()) throw new Error('Google Sheets is not configured. Add the spreadsheet ID and service-account credentials to .env.');
  const tokens = await getTokenCollection();
  const claimsCollection = await getClaimCollection();
  const normalizedRecipient = creatorAddress.toLowerCase();
  const [creatorTokens, claims] = await Promise.all([
    tokens.find({
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
      $or: [
        { creatorFeeRecipient: normalizedRecipient },
        { creatorAddress: normalizedRecipient },
      ],
    }).toArray(),
    claimsCollection.find({ creatorAddress: normalizedRecipient }).toArray(),
  ]);
  await updateGoogleSheetRows(creatorTokens.map((token) => buildGoogleSheetRow(token, claims)));
  return `https://docs.google.com/spreadsheets/d/${googleSheetsConfig()?.spreadsheetId}/edit`;
}

async function getVerifiedCreatorFeeClaims(
  creatorAddress: string,
  txHashes: string[],
): Promise<Array<{ asset: string; amountRaw: string }>> {
  const escrow = await serverChainClient.readContract({
    address: PONS_V2_FACTORY,
    abi: feeEscrowAddressAbi,
    functionName: 'feeEscrow',
  });
  const totals = new Map<string, bigint>();
  for (const transactionHash of txHashes) {
    const receipt = await serverChainClient.getTransactionReceipt({ hash: transactionHash as Hex });
    if (receipt.status !== 'success') {
      throw new Error(`Claim transaction ${transactionHash} did not succeed on Robinhood Chain.`);
    }
    let foundClaimForCreator = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== escrow.toLowerCase()) continue;
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: creatorFeeClaimEventsAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
      } catch {
        continue;
      }
      if (decoded.args.recipient.toLowerCase() !== creatorAddress.toLowerCase()) continue;
      const asset = decoded.eventName === 'Claimed'
        ? '0x0000000000000000000000000000000000000000'
        : decoded.args.token.toLowerCase();
      totals.set(asset, (totals.get(asset) || 0n) + decoded.args.amount);
      foundClaimForCreator = true;
    }
    if (!foundClaimForCreator) {
      throw new Error(`Claim transaction ${transactionHash} has no matching creator-fee claim event for this wallet.`);
    }
  }
  return [...totals].map(([asset, amount]) => ({ asset, amountRaw: amount.toString() }));
}

function broadcastExplore(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  exploreSockets.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  });
}

app.get('/api/explore/tokens', async (request, response) => {
  try {
    const collection = await getTokenCollection();
    const page = Math.max(1, Number(request.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(request.query.limit || 100)));
    const filter = {
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
    } as const;
    const [tokens, total] = await Promise.all([
      collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    response.json({ tokens, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Explore database unavailable.' });
  }
});

app.post('/api/explore/tokens', async (request, response) => {
  const token = request.body as Partial<ExploreToken>;
  if (typeof token.id !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(token.id)) {
    response.status(400).json({ error: 'A valid token address is required.' });
    return;
  }
  if (token.source !== 'tipped-launch' || token.factoryAddress?.toLowerCase() !== '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e') {
    response.status(400).json({ error: 'Only tokens launched through Tipped can be saved.' });
    return;
  }
  try {
    const collection = await getTokenCollection();
    const now = Date.now();
    const document: ExploreToken = {
      id: token.id,
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
      rank: Number(token.rank || 0),
      name: String(token.name || 'Pons V2 token'),
      ticker: String(token.ticker || '$TOKEN'),
      creatorHandle: String(token.creatorHandle || 'Unknown creator'),
      creatorName: String(token.creatorName || 'Unknown creator'),
      creatorAvatar: String(token.creatorAvatar || ''),
      creatorAddress: typeof token.creatorAddress === 'string' ? token.creatorAddress.toLowerCase() : undefined,
      creatorFeeRecipient: typeof token.creatorFeeRecipient === 'string'
        && /^0x[a-fA-F0-9]{40}$/.test(token.creatorFeeRecipient)
        ? token.creatorFeeRecipient.toLowerCase()
        : undefined,
      imageUrl: String(token.imageUrl || ''),
      marketCap: Number.isFinite(Number(token.marketCap)) ? Number(token.marketCap) : 0,
      volume24h: Number.isFinite(Number(token.volume24h)) ? Number(token.volume24h) : 0,
      priceChange24h: Number.isFinite(Number(token.priceChange24h)) ? Number(token.priceChange24h) : 0,
      age: String(token.age || 'just now'),
      description: typeof token.description === 'string' ? token.description : undefined,
      totalFeesPaid: Number.isFinite(Number(token.totalFeesPaid)) ? Number(token.totalFeesPaid) : 0,
      launchTxHash: typeof token.launchTxHash === 'string' && /^0x[a-fA-F0-9]+$/.test(token.launchTxHash)
        ? token.launchTxHash
        : undefined,
      createdAt: Number.isFinite(Number(token.createdAt)) ? Number(token.createdAt) : now,
      launchBlock: Number.isSafeInteger(Number(token.launchBlock)) && Number(token.launchBlock) > 0
        ? Number(token.launchBlock)
        : undefined,
      updatedAt: now,
    };
    const {
      createdAt,
      launchTxHash,
      creatorFeeRecipient,
      ...mutableFields
    } = document;
    const setFields = {
      ...mutableFields,
      ...(creatorFeeRecipient
        ? { creatorFeeRecipient }
        : {}),
      ...(launchTxHash ? { launchTxHash } : {}),
      updatedAt: now,
    };
    await collection.updateOne(
      { id: document.id },
      { $set: setFields, $setOnInsert: { createdAt } },
      { upsert: true },
    );
    broadcastExplore({ type: 'token:update', token: document });
    let googleSheetsSync: { synced: boolean; error?: string; url?: string } = { synced: false };
    try {
      const url = await syncGoogleSheetsCreatorTokens(
        document.creatorFeeRecipient || document.creatorAddress || '',
      );
      googleSheetsSync = {
        synced: true,
        url,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheets sync failed.';
      console.error('Google Sheets token sync failed:', message);
      googleSheetsSync = { synced: false, error: message };
    }
    response.json({ token: document, googleSheetsSync });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Explore database unavailable.' });
  }
});

app.post('/api/creator-fee-claims', async (request, response) => {
  const body = request.body as {
    creatorAddress?: string;
    amountWei?: string;
    amounts?: Array<{ asset?: string; amountRaw?: string }>;
    txHashes?: string[];
    tokenAddress?: string;
  };
  if (!body.creatorAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.creatorAddress)
    || !Array.isArray(body.txHashes) || body.txHashes.length === 0 || body.txHashes.length > 10
    || body.txHashes.some((hash) => typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash))) {
    response.status(400).json({ error: 'A creator address, claim amount, and transaction hashes are required.' });
    return;
  }
  try {
    const tokens = await getTokenCollection();
    const normalizedCreatorAddress = body.creatorAddress.toLowerCase();
    const token = await tokens.findOne({
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
      $or: [
        { creatorFeeRecipient: normalizedCreatorAddress },
        { creatorAddress: normalizedCreatorAddress },
      ],
    });
    if (!token) {
      response.status(404).json({ error: 'No Tipped launch found for this creator wallet.' });
      return;
    }
    const normalizedTokenAddress = typeof body.tokenAddress === 'string'
      && /^0x[a-fA-F0-9]{40}$/.test(body.tokenAddress)
      ? body.tokenAddress.toLowerCase()
      : undefined;
    if (body.tokenAddress && !normalizedTokenAddress) {
      response.status(400).json({ error: 'A valid token address is required.' });
      return;
    }
    if (normalizedTokenAddress && !await tokens.findOne({
      id: normalizedTokenAddress,
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
      $or: [
        { creatorFeeRecipient: normalizedCreatorAddress },
        { creatorAddress: normalizedCreatorAddress },
      ],
    })) {
      response.status(404).json({ error: 'The token does not belong to this Tipped creator wallet.' });
      return;
    }
    let amounts: Array<{ asset: string; amountRaw: string }>;
    try {
      amounts = await getVerifiedCreatorFeeClaims(
        body.creatorAddress.toLowerCase(),
        body.txHashes,
      );
    } catch (error) {
      response.status(422).json({
        error: error instanceof Error ? error.message : 'Claim transaction could not be verified on Robinhood Chain.',
      });
      return;
    }
    const claims = await getClaimCollection();
    const claimId = body.txHashes.slice().sort().join(':').toLowerCase();
    const claim: CreatorFeeClaim = {
      claimId,
      creatorAddress: body.creatorAddress.toLowerCase(),
      creatorHandle: token.creatorHandle,
      creatorName: token.creatorName,
      amountWei: amounts.find((entry) => entry.asset === '0x0000000000000000000000000000000000000000')?.amountRaw || '0',
      amountEth: Number(amounts.find((entry) => entry.asset === '0x0000000000000000000000000000000000000000')?.amountRaw || '0') / 1e18,
      amounts,
      tokenAddress: normalizedTokenAddress,
      txHashes: body.txHashes,
      claimedAt: Date.now(),
    };
    await claims.updateOne({ claimId }, { $setOnInsert: claim }, { upsert: true });
    let feeSnapshotWarning: string | undefined;
    if (normalizedTokenAddress) {
      try {
        const feeHistory = await getPonsV2TokenFeeHistory(
          normalizedTokenAddress as Address,
          (await tokens.findOne({ id: normalizedTokenAddress }, { projection: { launchBlock: 1 } }))?.launchBlock,
          true,
        );
        if (feeHistory.creator.toLowerCase() !== body.creatorAddress.toLowerCase()) {
          throw new Error('On-chain creator does not match the wallet that claimed these fees.');
        }
        const metadata = await getPonsV2FeeAssetMetadata(feeHistory.asset).catch(() => ({
          symbol: 'raw units',
          decimals: 0,
        }));
        await tokens.updateOne(
          { id: normalizedTokenAddress },
          { $set: {
            creatorFeeSnapshot: {
              asset: feeHistory.asset.toLowerCase(),
              symbol: metadata.symbol,
              decimals: metadata.decimals,
              earned: feeHistory.earned.toString(),
              pendingSweep: feeHistory.pendingSweep.toString(),
              credited: feeHistory.credited.toString(),
              claimed: feeHistory.claimed.toString(),
              remaining: feeHistory.remaining.toString(),
              capturedAt: Date.now(),
            },
            updatedAt: Date.now(),
          } },
        );
      } catch (error) {
        feeSnapshotWarning = error instanceof Error
          ? error.message
          : 'Unable to refresh live token fee history.';
        console.error('On-chain fee snapshot refresh failed:', feeSnapshotWarning);
      }
    }
    let googleSheetsSync: { synced: boolean; error?: string } = { synced: false };
    try {
      await syncGoogleSheetsCreatorTokens(claim.creatorAddress);
      googleSheetsSync = { synced: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google Sheets sync failed.';
      console.error('Google Sheets claim sync failed:', message);
      googleSheetsSync = { synced: false, error: message };
    }
    response.json({ claim, googleSheetsSync, feeSnapshotWarning });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Creator fee claim unavailable.' });
  }
});

app.get('/api/creator-fee-claims', async (request, response) => {
  const creatorAddress = request.query.creatorAddress;
  if (typeof creatorAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(creatorAddress)) {
    response.status(400).json({ error: 'A valid creator address is required.' });
    return;
  }
  try {
    const claims = await getClaimCollection();
    const records = await claims.find({ creatorAddress: creatorAddress.toLowerCase() }).toArray();
    const totals = new Map<string, bigint>();
    records.forEach((claim) => {
      const amounts = claim.amounts || [{ asset: '0x0000000000000000000000000000000000000000', amountRaw: claim.amountWei }];
      amounts.forEach((entry) => {
        const asset = entry.asset.toLowerCase();
        totals.set(asset, (totals.get(asset) || 0n) + BigInt(entry.amountRaw));
      });
    });
    response.json({ claimedByAsset: Object.fromEntries([...totals].map(([asset, amount]) => [asset, amount.toString()])) });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Creator fee history unavailable.' });
  }
});

app.get('/api/leaderboard', async (_request, response) => {
  try {
    const collection = await getTokenCollection();
    const filter = {
      source: 'tipped-launch',
      factoryAddress: '0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e',
    } as const;
    const [streamers, tokens] = await Promise.all([
      collection.aggregate([
        { $match: filter },
        { $group: {
          _id: { $toLower: '$creatorHandle' },
          handle: { $first: '$creatorHandle' },
          name: { $first: '$creatorName' },
          avatar: { $first: '$creatorAvatar' },
          creatorAddress: { $first: '$creatorAddress' },
          tokensCount: { $sum: 1 },
          highestMarketCap: { $max: '$marketCap' },
          totalMarketCap: { $sum: '$marketCap' },
        } },
      ]).toArray(),
      collection.find(filter).sort({ marketCap: -1, createdAt: -1 }).limit(10).toArray(),
    ]);
    let claimedFees: Array<{ _id: string; claimedFees: number }> = [];
    try {
      const claims = await getClaimCollection();
      claimedFees = await claims.aggregate([
        { $group: {
          _id: { $toLower: '$creatorHandle' },
          claimedFees: { $sum: '$amountEth' },
        } },
      ]).toArray() as Array<{ _id: string; claimedFees: number }>;
    } catch (error) {
      console.error('Leaderboard claim totals unavailable:', error);
    }
    const feesByHandle = new Map(claimedFees.map((claim) => [String(claim._id), Number(claim.claimedFees || 0)]));
    streamers.sort((a, b) => {
      const feeDifference = (feesByHandle.get(String(b._id)) || 0) - (feesByHandle.get(String(a._id)) || 0);
      return feeDifference || Number(b.tokensCount || 0) - Number(a.tokensCount || 0);
    });
    response.json({
      streamers: streamers.slice(0, 10).map((streamer, index) => ({
        id: String(streamer._id || `streamer-${index}`),
        handle: streamer.handle || streamer._id,
        name: streamer.name || streamer._id,
        avatar: streamer.avatar || '',
        tokensCount: streamer.tokensCount,
        diamonds: 0,
        creatorFeesPaid: feesByHandle.get(String(streamer._id)) || 0,
        isVerified: true,
        highestMarketCap: streamer.highestMarketCap || 0,
        totalMarketCap: streamer.totalMarketCap || 0,
      })),
      tokens,
    });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Leaderboard unavailable.' });
  }
});

let twitchAccessToken: string | undefined = process.env.TWITCH_APP_ACCESS_TOKEN;
let twitchTokenExpiresAt = twitchAccessToken ? Number.MAX_SAFE_INTEGER : 0;

async function getTwitchAccessToken(clientId: string): Promise<string | undefined> {
  if (twitchAccessToken && twitchTokenExpiresAt > Date.now() + 60_000) return twitchAccessToken;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientSecret) return twitchAccessToken;

  const tokenResponse = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  if (!tokenResponse.ok) return undefined;
  const token = await tokenResponse.json() as { access_token?: string; expires_in?: number };
  twitchAccessToken = token.access_token;
  twitchTokenExpiresAt = Date.now() + (token.expires_in || 0) * 1000;
  return twitchAccessToken;
}

function normalizeTwitchLogin(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').split(/[/?#]/)[0]
    : '';
}

function findTwitchChannel(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTwitchChannel(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const object = value as Record<string, unknown>;
  const hasChannelFields = ['login', 'username', 'broadcaster_login', 'display_name', 'displayName', 'profile_image_url', 'profileImageUrl', 'avatar', 'image']
    .some((key) => key in object);
  if (hasChannelFields) return object;
  for (const child of Object.values(object)) {
    const found = findTwitchChannel(child);
    if (found) return found;
  }
  return null;
}

app.get('/api/pons/launches', async (request, response) => {
  const upstream = new URL('https://robinhoodchain.blockscout.com/api/v2/addresses/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e/logs');
  Object.entries(request.query).forEach(([key, value]) => {
    if (typeof value === 'string') upstream.searchParams.set(key, value);
  });
  if (!upstream.searchParams.has('items_count')) upstream.searchParams.set('items_count', '50');
  try {
    const result = await fetch(upstream, { signal: AbortSignal.timeout(15_000) });
    const body = await result.text();
    response.status(result.status).type(result.headers.get('content-type') || 'application/json').send(body);
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Launch index unavailable.' });
  }
});

app.get('/api/pons/token-details/:token', async (request, response) => {
  const tokenAddress = request.params.token;
  if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    response.status(400).json({ error: 'Invalid token address.' });
    return;
  }
  const cacheKey = tokenAddress.toLowerCase();
  const cached = tokenDetailsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    response.json(cached.value);
    return;
  }
  const apiKey = process.env.PONS_KEY || process.env.PONS_API_KEY || process.env.VITE_PONS_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-api-key': apiKey } : {};
  const api = 'https://api.ponsapi.dev/v1';
  try {
    const get = async (path: string): Promise<unknown> => {
      const result = await fetch(`${api}${path}`, { headers, signal: AbortSignal.timeout(5_000) });
      if (!result.ok) throw new Error(`${result.status}: ${await result.text()}`);
      return result.json() as Promise<unknown>;
    };
    const results = await Promise.allSettled([
      get(`/tokens/${tokenAddress}`),
      get(`/tokens/${tokenAddress}/price`),
    ]);
    const asRecord = (result: PromiseSettledResult<unknown>): Record<string, unknown> => (
      result.status === 'fulfilled' && result.value && typeof result.value === 'object' && !Array.isArray(result.value)
        ? result.value as Record<string, unknown>
        : {}
    );
    const expandRecord = (root: Record<string, unknown>): Record<string, unknown> => {
      const records: Record<string, unknown>[] = [];
      const visit = (record: Record<string, unknown>, depth: number) => {
        if (depth > 3) return;
        records.push(record);
        for (const key of ['data', 'token', 'result', 'price']) {
          const child = record[key];
          if (child && typeof child === 'object' && !Array.isArray(child)) {
            visit(child as Record<string, unknown>, depth + 1);
          }
        }
      };
      visit(root, 0);
      return Object.assign({}, ...records);
    };
    const token = expandRecord(asRecord(results[0]));
    const price = expandRecord(asRecord(results[1]));
    const firstString = (...values: unknown[]) => values.find((value) => (
      typeof value === 'string' && value.trim().length > 0
    )) as string | undefined;
    const firstPositiveNumber = (...values: unknown[]) => {
      for (const value of values) {
        const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : 0;
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      return 0;
    };
    const failures = results.flatMap((result, index) => (
      result.status === 'rejected'
        ? [`${['token', 'price'][index]}: ${result.reason instanceof Error ? result.reason.message : 'upstream request failed'}`]
        : []
    ));
    if (failures.length > 0) {
      console.warn(`Pons token details partially unavailable for ${tokenAddress}: ${failures.join('; ')}`);
    }
    const priceUsd = firstPositiveNumber(
      price.priceUsd, price.price_usd, price.usdPrice, price.usd_price, price.price,
      token.priceUsd, token.price_usd, token.usdPrice, token.usd_price, token.price,
    );
    const priceEth = firstPositiveNumber(price.priceEth, price.price_eth, token.priceEth, token.price_eth);
    const marketCap = firstPositiveNumber(
      price.mcapUsd, price.marketCapUsd, price.market_cap_usd, price.marketCap,
      token.mcapUsd, token.marketCapUsd, token.market_cap_usd, token.marketCap,
    );
    const fdv = firstPositiveNumber(
      price.fdvUsd, price.fullyDilutedValuationUsd, price.fully_diluted_valuation_usd,
      token.fdvUsd, token.fullyDilutedValuationUsd, token.fully_diluted_valuation_usd,
    );
    const totalSupply = firstPositiveNumber(token.totalSupply, token.total_supply, token.supply);
    const tokenDecimals = firstPositiveNumber(token.decimals, token.tokenDecimals, token.token_decimals);
    const suppliedMarketCap = marketCap || fdv || (
      priceUsd > 0 && totalSupply > 0
        ? priceUsd * totalSupply / 10 ** (tokenDecimals > 0 ? tokenDecimals : 18)
        : 0
    );
    const result = {
      address: tokenAddress,
      name: token.name ?? null,
      symbol: token.symbol ?? null,
      image: firstString(token.logo, token.image, token.imageUrl, token.image_url, token.logoUrl, token.logoURI, token.logo_uri) ?? null,
      description: token.description ?? null,
      price: Number.isFinite(priceUsd) ? priceUsd : 0,
      priceEth: Number.isFinite(priceEth) ? priceEth : 0,
      marketCap: suppliedMarketCap,
      fdv,
      totalSupply,
      tokenDecimals: tokenDecimals > 0 ? tokenDecimals : null,
      volume1hEth: 0,
      volume24hEth: 0,
      volume1hUsd: 0,
      volume24hUsd: 0,
      pool: token.pool ?? null,
      pairedToken: token.pairedToken ?? null,
      graduated: token.graduated ?? null,
      creator: token.creator ?? token.deployer ?? null,
      socials: token.socials ?? {
        twitter: token.twitter ?? null,
        telegram: token.telegram ?? null,
        discord: token.discord ?? null,
        website: token.website ?? null,
      },
      partial: failures.length > 0,
    };
    tokenDetailsCache.set(cacheKey, { expiresAt: Date.now() + TOKEN_DETAILS_CACHE_TTL_MS, value: result });
    response.json(result);
  } catch (error) {
    console.error('Pons token details proxy failed:', error);
    response.status(502).json({ error: error instanceof Error ? error.message : 'Unable to load Pons token details.' });
  }
});

app.post('/api/twitch/channel', async (request, response) => {
  const login = normalizeTwitchLogin(request.body?.login);
  if (!login || login.length > 25 || !/^[a-zA-Z0-9_]+$/.test(login)) {
    response.status(400).json({ error: 'Enter a valid Twitch username.' });
    return;
  }
  const reefKey = process.env.REEF_KEY;
  if (!reefKey) {
    response.status(503).json({ error: 'Twitch lookup is not configured. Add REEF_KEY to the server environment.' });
    return;
  }
  try {
    const reefResponse = await fetch('https://api.reefapi.com/twitch/v1/channel', {
      method: 'POST',
      headers: { Accept: 'application/json', 'x-api-key': reefKey, 'content-type': 'application/json' },
      body: JSON.stringify({ login }),
    });
    const payload = await reefResponse.json() as { ok?: boolean; data?: unknown; error?: unknown };
    const channel = findTwitchChannel(payload.data);
    if (!reefResponse.ok || payload.ok === false || !channel) {
      const message = typeof payload.error === 'string' ? payload.error : 'Twitch channel was not found.';
      response.status(reefResponse.status || 502).json({ error: message });
      return;
    }
    const rawActive = channel.is_live ?? channel.live ?? channel.isLive;
    const avatar = channel.profile_image_url || channel.profileImageUrl || channel.profile_image
      || channel.image_url || channel.image || channel.avatar || channel.thumbnail_url || channel.thumbnail;
    const description = channel.description || channel.bio || channel.about || channel.channel_description
      || channel.channelDescription;
    response.json({ user: {
      handle: String(channel.login || channel.broadcaster_login || channel.username || login),
      name: String(channel.display_name || channel.displayName || channel.name || channel.login || login),
      avatar: typeof avatar === 'string' ? avatar : undefined,
      description: typeof description === 'string' ? description : undefined,
      isLive: typeof rawActive === 'boolean' ? rawActive : undefined,
      category: typeof channel.game_name === 'string' ? channel.game_name : typeof channel.category === 'string' ? channel.category : undefined,
    } });
  } catch (error) {
    console.error('ReefAPI Twitch channel lookup failed:', error);
    response.status(502).json({ error: 'Unable to reach the Twitch channel service.' });
  }
});
app.post('/api/launch', async (request, response) => {
  const apiKey = process.env.PONS_API_KEY || process.env.VITE_PONS_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: 'Pons API key is not configured on the server.' });
    return;
  }

  const {
    name,
    symbol,
    feeWallet,
    description,
    image,
    website,
    twitter,
    firstBuyEth,
  } = request.body as Record<string, unknown>;

  if (
    typeof name !== 'string' ||
    !name.trim() ||
    typeof symbol !== 'string' ||
    !symbol.trim() ||
    typeof feeWallet !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(feeWallet)
  ) {
    response.status(400).json({ error: 'name, symbol and a valid feeWallet are required.' });
    return;
  }

  const firstBuy = typeof firstBuyEth === 'number' ? firstBuyEth : 0;
  if (!Number.isFinite(firstBuy) || firstBuy < 0 || firstBuy > 5) {
    response.status(400).json({ error: 'firstBuyEth must be between 0 and 5.' });
    return;
  }

  try {
    const ponsResponse = await fetch('https://api.ponsapi.dev/v1/trade/launch/build', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        name: name.trim(),
        symbol: symbol.replace(/^\$/, '').trim().toUpperCase(),
        feeWallet,
        description: typeof description === 'string' ? description.trim() : undefined,
        image: typeof image === 'string' ? image : undefined,
        website: typeof website === 'string' ? website.trim() || undefined : undefined,
        twitter: typeof twitter === 'string' ? twitter.trim() || undefined : undefined,
        firstBuyEth: firstBuy,
      }),
    });

    const raw = await ponsResponse.text();
    console.log('[Pons launch response]', {
      status: ponsResponse.status,
      headers: Object.fromEntries(ponsResponse.headers.entries()),
      body: raw,
    });
    let data: Record<string, unknown> = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        response.status(502).json({ error: 'Pons API returned an invalid response.' });
        return;
      }
    }

    if (!ponsResponse.ok) {
      response.status(ponsResponse.status).json({
        error: typeof data.error === 'string' ? data.error : 'Pons API rejected the launch.',
      });
      return;
    }

    if (data.launchEnabled === false) {
      response.status(503).json({
        error: 'Pons token launches are currently disabled. No transaction was submitted.',
        launchEnabled: false,
      });
      return;
    }

    const launch = data.launch;
    if (!launch || typeof launch !== 'object') {
      response.status(502).json({ error: 'Pons API did not return a launch transaction.' });
      return;
    }

    response.json(data);
  } catch (error) {
    console.error('Pons launch proxy failed:', error);
    response.status(502).json({ error: 'Unable to reach Pons API.' });
  }
});

if (isProduction) {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_request, response) => {
    response.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

const httpServer = createServer(app);
const websocketServer = new WebSocketServer({ server: httpServer, path: '/ws/explore' });
websocketServer.on('connection', (socket) => {
  exploreSockets.add(socket);
  socket.send(JSON.stringify({ type: 'connected' }));
  socket.on('close', () => exploreSockets.delete(socket));
  socket.on('error', () => exploreSockets.delete(socket));
});

httpServer.listen(port, () => {
  console.log(`Tipped server listening on http://localhost:${port}`);
});
