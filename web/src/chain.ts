import {
  createPublicClient, createWalletClient, http, custom, formatUnits, parseUnits, zeroAddress,
  BaseError, ContractFunctionRevertedError, type Address, type Hash, type EIP1193Provider, type Transport,
} from 'viem';
import type { LoadedConfig } from './config';

declare global { interface Window { ethereum?: EIP1193Provider } }
export type Action = 'approve' | 'claim' | 'settle' | 'withdraw';
export type Service = Awaited<ReturnType<typeof connectRpc>>;
export interface Snapshot {
  round: bigint; king: Address; kingPayment: bigint; pot: bigint; minimum: bigint; deadline: bigint;
  balance: bigint; allowance: bigint; withdrawable: bigint; account?: Address;
  block: bigint; timestamp: bigint; fetchedAt: number;
}
export interface ClaimEvent { round: bigint; king: Address; amount: bigint; bonus: bigint; hash: Hash; block: bigint; index: number }

export async function connectRpc(config: LoadedConfig, provider?: EIP1193Provider) {
  const transports: { transport: Transport; label: string }[] = config.deployment.network.rpcUrls.map(url => ({ transport: http(url, { timeout: 8_000, retryCount: 0 }), label: new URL(url).hostname }));
  if (provider) transports.push({ transport: custom(provider, { retryCount: 0 }), label: 'connected wallet' });
  for (const { transport, label } of transports) {
    try {
      const client = createPublicClient({ chain: config.chain, transport, batch: { multicall: false }, pollingInterval: 4_000 });
      if (await client.getChainId() !== config.chain.id) continue;
      const [gameCode, tokenCode, boundToken, decimals, symbol] = await Promise.all([
        client.getBytecode({ address: config.game.address }), client.getBytecode({ address: config.token.address }),
        client.readContract({ ...config.game, functionName: 'token' }),
        client.readContract({ ...config.token, functionName: 'decimals' }),
        client.readContract({ ...config.token, functionName: 'symbol' }),
      ]);
      if (!gameCode || gameCode === '0x' || !tokenCode || tokenCode === '0x') throw new Error('Missing deployed code');
      if (String(boundToken).toLowerCase() !== config.token.address.toLowerCase() || decimals !== 18 || symbol !== 'CRWN') throw new Error('Token binding mismatch');
      // Use the token address returned by the game after matching it to the attested entry.
      return { config, client, label, token: { ...config.token, address: boundToken as Address }, decimals: Number(decimals) };
    } catch { /* Try the next configured public RPC, then the wallet if supplied. */ }
  }
  throw new Error('Could not verify this deployment through the configured RPCs. Check your connection and retry.');
}
export async function readSnapshot(service: Service, account?: Address): Promise<Snapshot> {
  const { client, config, token } = service;
  const block = await client.getBlock();
  if (block.number === null) throw new Error('The RPC has no confirmed block. Try again.');
  const gameRead = (functionName: string, args: unknown[] = []) => client.readContract({ ...config.game, functionName, args, blockNumber: block.number! });
  const tokenRead = (functionName: string, args: unknown[]) => client.readContract({ ...token, functionName, args, blockNumber: block.number! });
  const [round, king, kingPayment, pot, minimum, deadline, balance, allowance, withdrawable] = await Promise.all([
    gameRead('round'), gameRead('king'), gameRead('kingPayment'), gameRead('pot'), gameRead('minNextClaim'), gameRead('deadline'),
    account ? tokenRead('balanceOf', [account]) : 0n,
    account ? tokenRead('allowance', [account, config.game.address]) : 0n,
    account ? gameRead('withdrawable', [account]) : 0n,
  ]);
  return { round, king, kingPayment, pot, minimum, deadline, balance, allowance, withdrawable, account,
    block: block.number, timestamp: block.timestamp, fetchedAt: Date.now() } as Snapshot;
}
export async function readClaims(service: Service, from: bigint, to: bigint): Promise<ClaimEvent[]> {
  const logs = await service.client.getContractEvents({ ...service.config.game, eventName: 'Claimed', fromBlock: from, toBlock: to, strict: true });
  return logs.map(log => {
    const args = log.args as unknown as { round: bigint; king: Address; amount: bigint; bonus: bigint };
    return { ...args, hash: log.transactionHash!, block: log.blockNumber!, index: log.logIndex! };
  }).reverse();
}
export function amountValue(text: string, decimals: number): bigint | undefined {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text) || text.length > 90) return;
  const value = parseUnits(text, decimals);
  if (value > 0n && value < 2n ** 256n) return value;
}
export function exact(value: bigint, decimals = 18) { return formatUnits(value, decimals); }
export function amount(value: bigint, decimals = 18) {
  const [whole, fraction] = exact(value, decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}${fraction ? '.' + fraction.slice(0, 4) + (fraction.length > 4 ? '…' : '') : ''}`;
}
export function short(address: string) { return `${address.slice(0, 6)}…${address.slice(-4)}`; }
export function hasKing(state: Snapshot) { return state.king.toLowerCase() !== zeroAddress; }
export function isFresh(state: Snapshot) { return Date.now() - state.fetchedAt < 45_000 && Math.abs(Date.now() / 1000 - Number(state.timestamp)) < 180; }
export function claimProblem(state: Snapshot, account: Address, value: bigint | undefined) {
  if (!isFresh(state)) return 'State is stale. Refresh before continuing.';
  if (state.account?.toLowerCase() !== account.toLowerCase()) return 'Loading this wallet’s balances…';
  if (hasKing(state) && state.king.toLowerCase() === account.toLowerCase()) return 'You are the current king. Another wallet must claim next.';
  const estimatedNow = Number(state.timestamp) + Math.floor((Date.now() - state.fetchedAt) / 1000);
  if (hasKing(state) && estimatedNow >= Number(state.deadline)) return 'This round has ended. Settle it to start the next round.';
  if (!value) return 'Enter a positive CRWN amount with at most 18 decimals.';
  if (value < state.minimum) return `Enter at least ${exact(state.minimum)} CRWN.`;
  if (value > state.balance) return 'Your CRWN balance is too low. Get CRWN before claiming.';
  return '';
}
export async function switchNetwork(provider: EIP1193Provider, config: LoadedConfig) {
  const chainId = config.deployment.walletAddChain.chainId as `0x${string}`;
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] }); }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|not added/i.test(e.message || '')) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [config.deployment.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}
export function errorText(error: unknown) {
  const e = error as { code?: number; message?: string; shortMessage?: string };
  if (e.code === 4001 || /user rejected|user denied/i.test(e.message || '')) return 'Request declined in your wallet. You can try again when ready.';
  if (error instanceof BaseError) {
    const reverted = error.walk(e => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const messages: Record<string, string> = {
        AlreadyKing: 'You are already king. Wait for another player to claim.',
        BelowMinimum: 'The minimum claim changed. Refresh and review the new amount.',
        RoundOver: 'The round has ended. Refresh and settle the round.',
        RoundActive: 'The round is still active on-chain. Wait for the deadline.',
        NoKing: 'There is no king to settle. Refresh the round.',
        NothingToWithdraw: 'No CRWN is available to withdraw. Refresh your balance.',
        ERC20InsufficientAllowance: 'Approve enough CRWN before claiming.',
        ERC20InsufficientBalance: 'Your CRWN balance is too low. Refresh your balance.',
      };
      return (name && messages[name]) || `Simulation reverted: ${name || reverted.reason || 'unknown reason'}. Refresh before trying again.`;
    }
  }
  return (e.shortMessage || e.message || 'Request failed. Check your connection and try again.').slice(0, 320);
}
export async function transact(service: Service, provider: EIP1193Provider, account: Address, action: Action, value: bigint | undefined, onStatus: (message: string, hash?: Hash) => void, valid: () => boolean) {
  const ensureWallet = async () => {
    const [chain, accounts] = await Promise.all([provider.request({ method: 'eth_chainId' }), provider.request({ method: 'eth_accounts' })]);
    if (!valid() || Number(chain) !== service.config.chain.id || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet or network changed. Review the current account and try again.');
  };
  await ensureWallet();
  onStatus('Checking the latest contract state…');
  const state = await readSnapshot(service, account);
  if (!isFresh(state)) throw new Error('Chain data is stale. Retry when the RPC is current.');
  if (action === 'approve' || action === 'claim') {
    const problem = claimProblem(state, account, value);
    if (problem) throw new Error(problem);
    if (action === 'claim' && state.allowance < value!) throw new Error('Approve this amount of CRWN before claiming.');
  }
  if (action === 'settle' && (!hasKing(state) || state.timestamp < state.deadline)) throw new Error('Settlement is not available on-chain yet. Refresh after the deadline.');
  if (action === 'withdraw' && state.withdrawable === 0n) throw new Error('No CRWN is available to withdraw.');
  const target = action === 'approve' ? service.token : service.config.game;
  const args = action === 'approve' ? [service.config.game.address, value!] : action === 'claim' ? [value!] : [];
  onStatus(`Simulating ${action}…`);
  const { request } = await service.client.simulateContract({ ...target, functionName: action, args, account });
  await ensureWallet();
  onStatus(`Confirm ${action} in your wallet.`);
  const wallet = createWalletClient({ chain: service.config.chain, transport: custom(provider), account });
  const hash = await wallet.writeContract(request);
  onStatus('Transaction submitted. Waiting for confirmation…', hash);
  let replacedAction = false;
  const receipt = await service.client.waitForTransactionReceipt({ hash, timeout: 120_000, onReplaced: ({ reason, transactionReceipt }) => {
    replacedAction = reason !== 'repriced';
    onStatus('Replacement transaction detected. Checking confirmation…', transactionReceipt.transactionHash);
  } });
  if (replacedAction) throw new Error('Transaction was cancelled or replaced with a different action. Review the explorer and refresh your balances.');
  if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain. No game action completed; gas may have been spent. Refresh and review.');
  onStatus(`${action === 'approve' ? 'Approval' : action === 'claim' ? 'Claim' : action === 'settle' ? 'Settlement' : 'Withdrawal'} confirmed.`, receipt.transactionHash);
  return receipt;
}
