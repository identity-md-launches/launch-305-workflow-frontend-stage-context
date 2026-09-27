import { keccak256, toHex, isAddress, defineChain, type Abi, type Address } from 'viem';

export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  deploymentBlock: number;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[]; uniswapV4: Record<string, Address>;
  };
  walletAddChain: {
    chainId: string; chainName: string; rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[];
  };
}
export type LoadedConfig = Awaited<ReturnType<typeof loadConfig>>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}
async function json(path: string) {
  const response = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Unable to load ${path}. Reload or check the site files.`);
  return response.json();
}
export async function loadConfig() {
  const deployment: Deployment = await json('imd-deployment.json');
  if (deployment.version !== 1 || deployment.chainId !== deployment.network.chainId ||
      Number(deployment.walletAddChain.chainId) !== deployment.chainId ||
      deployment.contracts.length !== 2 || !Number.isSafeInteger(deployment.deploymentBlock) ||
      !deployment.network.rpcUrls.length) throw new Error('Deployment configuration is invalid. Transactions are disabled.');
  const loaded = await Promise.all(deployment.contracts.map(async contract => {
    if (!isAddress(contract.address) || !/^abi\/[A-Za-z0-9_]+\.json$/.test(contract.abiPath)) throw new Error('Invalid contract entry.');
    const abi: Abi = await json(contract.abiPath);
    if (!Array.isArray(abi) || keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2) !== contract.abiHash) throw new Error(`ABI verification failed for ${contract.name}. Transactions are disabled.`);
    return { ...contract, abi };
  }));
  const game = loaded.find(contract => contract.name === 'KingOfTheHill');
  const token = loaded.find(contract => contract.name === 'LaunchToken');
  if (!game || !token) throw new Error('Deployment is missing the game or token.');
  const chain = defineChain({
    id: deployment.chainId, name: deployment.network.name, nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: deployment.network.explorer } }, testnet: deployment.network.testnet,
  });
  return { deployment, chain, game, token };
}
