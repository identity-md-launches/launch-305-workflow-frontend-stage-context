import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('dist/imd-deployment.json', root)));
const checks = [];
for (const url of manifest.network.rpcUrls) {
  const entry = { rpc: url, checkedAt: new Date().toISOString() };
  try {
    const client = createPublicClient({ transport: http(url, { timeout: 12000, retryCount: 0 }) });
    entry.chainId = await client.getChainId();
    if (entry.chainId !== manifest.chainId) throw new Error('Chain mismatch');
    entry.contracts = [];
    for (const contract of manifest.contracts) {
      const code = await client.getBytecode({ address: contract.address });
      if (!code || code === '0x') throw new Error(`Missing code: ${contract.name}`);
      const abi = JSON.parse(await readFile(new URL(`dist/${contract.abiPath}`, root)));
      const result = await client.readContract({ address: contract.address, abi, functionName: contract.name === 'KingOfTheHill' ? 'token' : 'totalSupply' });
      entry.contracts.push({ name: contract.name, address: contract.address, runtimeBytes: (code.length - 2) / 2, [contract.name === 'KingOfTheHill' ? 'token' : 'totalSupply']: String(result) });
    }
    const block = await client.getBlock();
    entry.blockNumber = String(block.number); entry.blockTimestamp = String(block.timestamp);
    entry.ok = true;
  } catch (error) { entry.ok = false; entry.error = (error.shortMessage || error.message).slice(0, 300); }
  checks.push(entry);
}
await writeFile(new URL('docs/evidence/live-rpc.json', root), JSON.stringify(checks, null, 2) + '\n');
console.log(JSON.stringify(checks, null, 2));
if (!checks.some(check => check.ok)) process.exitCode = 1;
