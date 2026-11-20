// lib/model.ts — the "radar-2" value model for the token launch radar.
//
// A protocol that records no token is worth something if it ever issues one.
// This module turns the sealed snapshot's own figures into that worth: the
// protocol's TVL, its seven-day growth, how long it has run, and how many
// chains it lives on. No name is special-cased anywhere: one formula scores
// every protocol, and the board is the formula's order.
//
//   implied = round(TVL x 0.25 x growth x maturity x breadth)
//
//   growth    = 1 + clamp(change_7d, -60, 120) / 100 x 0.5
//   maturity  = 0.6 + min(age_days, 1095) / 1095 x 0.4   (unknown age: 365 days)
//   breadth   = 1 + 0.05 x min(max(chains - 1, 0), 4)
//
// The same module also writes each row's farm plan: eight concrete steps
// derived from the protocol's own record (its category, its TVL tier, its
// age, its chains), each carrying what it costs and how long it takes.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface SnapshotDoc {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard's data file carries them. */
export const MODEL_PARAMS = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_chain: 0.05,
  breadth_max_chains: 4,
} as const;

export const MODEL_VERSION = 'radar-2';

/** One row's model numbers, as the board carries them. */
export interface ModelBreakdown {
  base_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  age_days: number | null;
}

/** A board row: the snapshot's record plus rank, value, model and plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

/** A dashboard row: a board row slimmed down for the page. */
export interface DashboardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token row: the protocols whose token already trades. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

// ---------------------------------------------------------------- helpers

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** Whole days from one UTC date (YYYY-MM-DD) to another. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const ms = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(ms / 86_400_000);
}

/** A protocol's age in days at the snapshot's date, null when unlisted. */
export function ageOf(protocol: SnapshotProtocol, asOf: string): number | null {
  if (protocol.listed_at === null) return null;
  return daysBetween(protocol.listed_at, asOf);
}

// ---------------------------------------------------------------- the model

/** The growth factor from a protocol's seven-day TVL change (null: no move). */
export function growthFactor(change7d: number | null): number {
  const pct = change7d ?? 0;
  const held = clamp(pct, MODEL_PARAMS.growth_floor, MODEL_PARAMS.growth_cap);
  return 1 + (held / 100) * MODEL_PARAMS.growth_weight;
}

/** The maturity factor from an age in days (null: the unknown-age stand-in). */
export function maturityFactor(ageDays: number | null): number {
  const age = ageDays ?? MODEL_PARAMS.unknown_age_days;
  const capped = Math.min(Math.max(age, 0), MODEL_PARAMS.maturity_days);
  return (
    MODEL_PARAMS.maturity_floor +
    (capped / MODEL_PARAMS.maturity_days) * MODEL_PARAMS.maturity_range
  );
}

/** The breadth factor from how many chains a protocol lives on. */
export function breadthFactor(chainCount: number): number {
  const extra = Math.min(Math.max(chainCount - 1, 0), MODEL_PARAMS.breadth_max_chains);
  return 1 + extra * MODEL_PARAMS.breadth_per_chain;
}

/** Every model number for one protocol, display-rounded where shown. */
export function breakdown(protocol: SnapshotProtocol, asOf: string): ModelBreakdown {
  const ageDays = ageOf(protocol, asOf);
  // growth_pct is the change the factor actually uses: clamped to the band.
  const growthPct = clamp(
    protocol.change_7d ?? 0,
    MODEL_PARAMS.growth_floor,
    MODEL_PARAMS.growth_cap,
  );
  return {
    base_multiple: MODEL_PARAMS.base_multiple,
    growth_pct: growthPct,
    growth_multiplier: roundTo(growthFactor(protocol.change_7d), 4),
    maturity_multiplier: roundTo(maturityFactor(ageDays), 4),
    breadth_multiplier: roundTo(breadthFactor(protocol.chains.length), 2),
    age_days: ageDays,
  };
}

/** The implied value of a protocol's token, from the raw (unrounded) factors. */
export function impliedUsd(protocol: SnapshotProtocol, asOf: string): number {
  const value =
    protocol.tvl_usd *
    MODEL_PARAMS.base_multiple *
    growthFactor(protocol.change_7d) *
    maturityFactor(ageOf(protocol, asOf)) *
    breadthFactor(protocol.chains.length);
  return Math.max(1, Math.round(value));
}

// ---------------------------------------------------------------- selection

/** True when the snapshot records no token for a protocol. */
export function recordsNoToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

/** True when a name ends in a version marker ("V2", "V12", "2.0" and the like). */
export function isVersionedName(name: string): boolean {
  return /\s[vV]\d+(\.\d+)?$/.test(name) || /\s\d+\.\d+$/.test(name);
}

/**
 * The board's subjects: every watchlist protocol, plus every pre-token
 * protocol below the floor that is not a centralised exchange and whose
 * name carries no version marker.
 */
export function boardSubjects(snapshot: SnapshotDoc): SnapshotProtocol[] {
  const wanted = new Set(snapshot.watchlist);
  const early = snapshot.protocols.filter(
    (p) =>
      recordsNoToken(p) &&
      p.tvl_usd < snapshot.floor_usd &&
      p.category !== 'CEX' &&
      !isVersionedName(p.name),
  );
  for (const p of early) wanted.add(p.slug);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  return [...wanted].map((slug) => bySlug.get(slug)!).filter(Boolean);
}

/**
 * The live-token table: the 24 largest protocols by market cap whose token
 * already trades, centralised exchanges set aside.
 */
export function liveSubjects(snapshot: SnapshotDoc): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24);
}

// ---------------------------------------------------------------- farm plans

/** The capital a farm position opens with, by the protocol's TVL tier. */
export function stakeFor(tvlUsd: number): number {
  if (tvlUsd < 100_000_000) return 50;
  if (tvlUsd < 1_000_000_000) return 100;
  if (tvlUsd < 10_000_000_000) return 150;
  return 250;
}

/** The gas a first action budgets, by the capital it moves. */
function gasFor(capital: number): number {
  return capital >= 150 ? 8 : 4;
}

/** How long a position is held, by the protocol's age (unknown: 365 days). */
export function holdFor(ageDays: number | null): number {
  const age = ageDays ?? MODEL_PARAMS.unknown_age_days;
  if (age >= 365) return 30;
  if (age >= 180) return 45;
  return 60;
}

/**
 * One category's two moves: how a position opens, and what its second
 * action is. The groups below cover every category the board carries;
 * anything unlisted falls back to a plain deposit and a governance vote.
 */
interface Playbook {
  open: (name: string, chain: string, capital: number, gas: number) => string;
  follow: (name: string, chain: string, capital: number) => string;
}

const PLAYBOOKS: Record<string, Playbook> = {
  vault: {
    open: (name, chain, capital, gas) =>
      `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name, chain, capital) =>
      `Move $${capital / 2} between two ${name} vaults on ${chain}. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  deposit: {
    open: (name, chain, capital, gas) =>
      `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Vote or sign one governance action on ${name} when it opens one. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  supply: {
    open: (name, chain, capital, gas) =>
      `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name, _chain, capital) =>
      `Borrow $${capital / 2} against the position on ${name} and repay it the same week. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  liquidity: {
    open: (name, chain, capital, gas) =>
      `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Swap $25 of USDC for the pool's other asset on ${name} and add it to the position. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  stake: {
    open: (name, _chain, capital, gas) =>
      `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Restake or compound the rewards ${name} pays, once, and keep the receipt. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  bridge: {
    open: (name, chain, capital, gas) =>
      `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name, chain) =>
      `Send a second, smaller bridge of $25 through ${name} to ${chain} in a different week. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  margin: {
    open: (name, _chain, capital, gas) =>
      `Deposit $${capital} of USDC as margin on ${name} and open one small hedge. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Close the hedge on ${name} and open a fresh one half its size. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  mintYield: {
    open: (_name, chain, capital, gas) =>
      `Mint $${capital} of the protocol's yield asset on ${chain} and hold it. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Check the yield ${name} reports for the asset and reinvest one payout. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  mintStable: {
    open: (name, chain, capital, gas) =>
      `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Redeem $25 of the stable asset through ${name} and deposit it again. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  cover: {
    open: (name, chain, capital, gas) =>
      `Buy $${capital} of cover from ${name} on ${chain} and keep the policy. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Open a second, smaller cover on ${name} for a different risk. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  chainUse: {
    open: (name, chain, capital, gas) =>
      `Use ${name} on ${chain} with $${capital} of capital and keep the activity on-chain. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Make one more on-chain action on ${name} in a different week. Cost: about $2 of gas. Time: 10 minutes.`,
  },
  market: {
    open: (name, _chain, capital, gas) =>
      `Fund $${capital} and place one market position on ${name}. Cost: $${capital} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    follow: (name) =>
      `Settle one market on ${name} and place a second position in a different market. Cost: about $2 of gas. Time: 10 minutes.`,
  },
};

const CATEGORY_PLAYBOOK: Record<string, keyof typeof PLAYBOOKS> = {
  'Onchain Capital Allocator': 'vault',
  'Risk Curators': 'vault',
  'Anchor BTC': 'deposit',
  'Basis Trading': 'deposit',
  CeDeFi: 'deposit',
  'Crypto Card Issuer': 'deposit',
  'Decentralized BTC': 'deposit',
  Farm: 'deposit',
  'Governance Incentives': 'deposit',
  'Liquidity Manager': 'deposit',
  Payments: 'deposit',
  CDP: 'supply',
  'Collateral Markets': 'supply',
  Lending: 'supply',
  'Uncollateralized Lending': 'supply',
  Dexs: 'liquidity',
  Indexes: 'liquidity',
  'Leveraged Farming': 'liquidity',
  Yield: 'liquidity',
  'Yield Aggregator': 'liquidity',
  'Liquid Restaking': 'stake',
  'Liquid Staking': 'stake',
  Restaking: 'stake',
  'Staking Pool': 'stake',
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  Derivatives: 'margin',
  'Interest Rate Derivatives': 'margin',
  RWA: 'mintYield',
  'Dual-Token Stablecoin': 'mintStable',
  'Stablecoin Wrapper': 'mintStable',
  Insurance: 'cover',
  Chain: 'chainUse',
  'Prediction Market': 'market',
};

/** The eight farm steps for one protocol, from its own record. */
export function farmPlan(protocol: SnapshotProtocol, ageDays: number | null): string[] {
  const capital = stakeFor(protocol.tvl_usd);
  const gas = gasFor(capital);
  const firstChain = protocol.chains[0] ?? 'Ethereum';
  const secondChain = protocol.chains[1];
  const playbook = PLAYBOOKS[CATEGORY_PLAYBOOK[protocol.category ?? ''] ?? 'deposit']!;
  const holdDays = holdFor(ageDays);
  const steps: string[] = [
    'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
    playbook.open(protocol.name, firstChain, capital, gas),
    playbook.follow(protocol.name, firstChain, capital),
    'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
    `Hold the position for at least ${holdDays} days so the activity is counted in more than one snapshot. Cost: the $${capital} stays in the position. Time: ${holdDays} days.`,
    secondChain !== undefined
      ? `Use ${protocol.name} on a second chain too: move $25 of the position to ${secondChain} so the activity is not on one chain only. Cost: about $3 of bridge and gas fees. Time: 20 minutes.`
      : `Keep gas on ${firstChain} ready before each action, so a weekly action is never skipped for a missing fee. Cost: about $5 of the chain’s gas token, held aside. Time: 5 minutes.`,
    "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.",
    'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.',
  ];
  return steps;
}

// ---------------------------------------------------------------- the board

/** One protocol scored and shaped into its board row. */
export function scoreRow(protocol: SnapshotProtocol, rank: number, asOf: string): BoardRow {
  const ageDays = ageOf(protocol, asOf);
  return {
    rank,
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: protocol.chains,
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    gecko_id: protocol.gecko_id,
    symbol: protocol.symbol,
    token_status: 'pre-token',
    age_days: ageDays,
    implied_value_usd: impliedUsd(protocol, asOf),
    model: breakdown(protocol, asOf),
    farm_steps: farmPlan(protocol, ageDays),
  };
}

/** The whole board: every subject scored, ranked by implied value. */
export function buildBoard(snapshot: SnapshotDoc): BoardRow[] {
  const scored = boardSubjects(snapshot).map((p) => ({
    protocol: p,
    value: impliedUsd(p, snapshot.as_of),
  }));
  scored.sort((a, b) =>
    b.value !== a.value ? b.value - a.value : a.protocol.slug < b.protocol.slug ? -1 : 1,
  );
  return scored.map((s, i) => scoreRow(s.protocol, i + 1, snapshot.as_of));
}

/** A board row slimmed down for the dashboard's data file. */
export function dashboardRow(row: BoardRow, onWatchlist: boolean): DashboardRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    on_watchlist: onWatchlist,
  };
}

/** A live-token protocol shaped for the dashboard's data file. */
export function liveRow(protocol: SnapshotProtocol): LiveRow {
  return {
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: protocol.chains,
    tvl_usd: protocol.tvl_usd,
    mcap_usd: protocol.mcap_usd ?? 0,
    change_7d: protocol.change_7d,
  };
}
