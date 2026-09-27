import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeFunctionResult, encodeErrorResult, encodeEventTopics, encodeAbiParameters, parseUnits, zeroAddress, toHex } from 'viem';
import { type Page } from '@playwright/test';

export const manifest = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url), 'utf8'));
export const game = manifest.contracts.find((c: any) => c.name === 'KingOfTheHill');
export const token = manifest.contracts.find((c: any) => c.name === 'LaunchToken');
export const gameAbi = JSON.parse(readFileSync(new URL(`../../dist/${game.abiPath}`, import.meta.url), 'utf8'));
export const tokenAbi = JSON.parse(readFileSync(new URL(`../../dist/${token.abiPath}`, import.meta.url), 'utf8'));
export const account = '0x1111111111111111111111111111111111111111';
export const challenger = '0x2222222222222222222222222222222222222222';
export const units = (value: string) => parseUnits(value, 18);
const blockHash = `0x${'aa'.repeat(32)}`;
const hashFor = (number: number) => `0x${number.toString(16).padStart(64, '0')}`;
export async function fixture(page: Page, options: { wallet?: boolean; wrongChain?: boolean; occupied?: boolean; expired?: boolean; noCode?: boolean; wrongToken?: boolean; history?: boolean } = {}) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const state = {
    round: 1n, king: options.occupied ? challenger : zeroAddress, kingPayment: options.occupied ? units('1000') : 0n,
    pot: options.occupied ? units('1000') : 0n, balance: units('10000'), allowance: 0n, withdrawable: units('75'),
    deadline: options.occupied ? (options.expired ? now : now + 86000n) : 0n,
    timestamp: now, block: BigInt(manifest.deploymentBlock) + 4000n,
    failRpc: false, failHistory: false, simulationError: '', revertReceipt: false, failBalance: false,
  };
  const writes: any[] = [], calls: any[] = [];
  const receipts = new Map<string, any>();
  const events: any[] = [];
  const log = (amount: bigint, number: bigint, id: number) => ({
    address: game.address, blockHash, blockNumber: toHex(number), transactionHash: hashFor(id), transactionIndex: '0x0', logIndex: '0x0', removed: false,
    topics: encodeEventTopics({ abi: gameAbi, eventName: 'Claimed', args: { round: 1n, king: account, dethroned: zeroAddress } }),
    data: encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [amount, 0n]),
  });
  if (options.history) { events.push(log(units('1000'), state.block - 1n, 101), log(units('1100'), state.block - 3000n, 102)); }
  const rpc = (method: string, params: any[] = []): any => {
    calls.push({ method, params });
    if (state.failRpc) throw { code: -32000, message: 'Mock RPC unavailable' };
    if (method === 'eth_chainId') return toHex(manifest.chainId);
    if (method === 'eth_getCode') return options.noCode ? '0x' : '0x6001600055';
    if (method === 'eth_blockNumber') return toHex(state.block);
    if (method === 'eth_getBlockByNumber') return {
      number: toHex(state.block), hash: blockHash, parentHash: blockHash, nonce: '0x0000000000000000', sha3Uncles: blockHash,
      logsBloom: `0x${'00'.repeat(256)}`, transactionsRoot: blockHash, stateRoot: blockHash, receiptsRoot: blockHash,
      miner: zeroAddress, difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x100',
      gasLimit: '0x1c9c380', gasUsed: '0x5208', timestamp: toHex(state.timestamp), transactions: [], uncles: [], baseFeePerGas: '0x1',
    };
    if (method === 'eth_getLogs') {
      if (state.failHistory) throw { code: -32000, message: 'Mock log range unavailable' };
      return events.filter(event => BigInt(event.blockNumber) >= BigInt(params[0].fromBlock) && BigInt(event.blockNumber) <= BigInt(params[0].toBlock));
    }
    if (method === 'eth_getTransactionReceipt') return receipts.get(params[0]) || null;
    if (method === 'eth_call') {
      const target = params[0].to.toLowerCase() === token.address.toLowerCase() ? tokenAbi : gameAbi;
      const decoded = decodeFunctionData({ abi: target, data: params[0].data });
      const name = decoded.functionName;
      if (['approve', 'claim', 'settle', 'withdraw'].includes(name)) {
        if (state.simulationError) throw { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi: gameAbi, errorName: state.simulationError }) };
        return name === 'approve' ? encodeFunctionResult({ abi: tokenAbi, functionName: name, result: true }) : '0x';
      }
      if (state.failBalance && name === 'balanceOf') throw { code: -32000, message: 'Balance unavailable' };
      const values: Record<string, any> = {
        token: options.wrongToken ? challenger : token.address, decimals: 18, symbol: 'CRWN', round: state.round, king: state.king,
        kingPayment: state.kingPayment, pot: state.pot, deadline: state.deadline,
        minNextClaim: state.king === zeroAddress ? units('1000') : (state.kingPayment * 110n + 99n) / 100n,
        balanceOf: state.balance, allowance: state.allowance, withdrawable: state.withdrawable,
      };
      if (!(name in values)) throw new Error(`Unexpected read ${name}`);
      return encodeFunctionResult({ abi: target, functionName: name, result: values[name] });
    }
    throw new Error(`Unexpected RPC ${method}`);
  };
  for (const url of manifest.network.rpcUrls) await page.route(url, async route => {
    const payload = route.request().postDataJSON();
    const respond = (request: any) => {
      try { return { jsonrpc: '2.0', id: request.id, result: rpc(request.method, request.params) }; }
      catch (error) { return { jsonrpc: '2.0', id: request.id, error }; }
    };
    await route.fulfill({ json: Array.isArray(payload) ? payload.map(respond) : respond(payload) });
  });
  await page.route('**/__test_wallet', async route => {
    const tx = route.request().postDataJSON();
    const abi = tx.to.toLowerCase() === token.address.toLowerCase() ? tokenAbi : gameAbi;
    const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
    writes.push({ ...tx, functionName, args });
    const hash = hashFor(writes.length);
    if (!state.revertReceipt) {
      if (functionName === 'approve') state.allowance = args![1] as bigint;
      if (functionName === 'claim') {
        const amount = args![0] as bigint;
        const bonus = state.king === zeroAddress ? 0n : amount * 5n / 100n;
        state.pot += amount - state.kingPayment - bonus;
        state.balance -= amount; state.allowance -= amount; state.king = tx.from; state.kingPayment = amount; state.deadline = now + 86400n;
        events.push(log(amount, state.block, writes.length));
      }
      if (functionName === 'settle') { if (state.king === account) state.withdrawable += state.pot; state.round++; state.king = zeroAddress; state.kingPayment = 0n; state.pot = 0n; state.deadline = 0n; }
      if (functionName === 'withdraw') { state.balance += state.withdrawable; state.withdrawable = 0n; }
    }
    receipts.set(hash, { transactionHash: hash, blockHash, blockNumber: toHex(state.block), transactionIndex: '0x0', from: tx.from, to: tx.to, cumulativeGasUsed: '0x5208', effectiveGasPrice: '0x1', gasUsed: '0x5208', contractAddress: null, logs: [], logsBloom: `0x${'00'.repeat(256)}`, status: state.revertReceipt ? '0x0' : '0x1', type: '0x2' });
    await route.fulfill({ json: hash });
  });
  if (options.wallet !== false) await page.addInitScript(({ account, chainId, wrongChain }) => {
    const w = window as any;
    const handlers: Record<string, Function[]> = {};
    w.mockWallet = { chain: wrongChain ? '0x1' : chainId, account, unknown: wrongChain, reject: false, requests: [],
      emit(name: string, value: any) { (handlers[name] || []).forEach(fn => fn(value)); } };
    w.ethereum = {
      on(name: string, fn: Function) { (handlers[name] ||= []).push(fn); },
      removeListener(name: string, fn: Function) { handlers[name] = (handlers[name] || []).filter(item => item !== fn); },
      async request({ method, params }: any) {
        const wallet = w.mockWallet;
        wallet.requests.push({ method, params });
        if (wallet.reject && ['eth_requestAccounts', 'eth_sendTransaction', 'wallet_switchEthereumChain'].includes(method)) throw { code: 4001, message: 'User rejected request' };
        if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return wallet.account ? [wallet.account] : [];
        if (method === 'eth_chainId') return wallet.chain;
        if (method === 'wallet_switchEthereumChain') {
          if (wallet.unknown) throw { code: 4902, message: 'Unknown chain' };
          wallet.chain = params[0].chainId; wallet.emit('chainChanged', wallet.chain); return null;
        }
        if (method === 'wallet_addEthereumChain') { wallet.unknown = false; return null; }
        if (method === 'eth_sendTransaction') return (await fetch('/preview/__test_wallet', { method: 'POST', body: JSON.stringify(params[0]) })).json();
        throw new Error('Unexpected wallet method: ' + method);
      },
    };
  }, { account, chainId: toHex(manifest.chainId), wrongChain: options.wrongChain });
  return { state, writes, calls };
}
