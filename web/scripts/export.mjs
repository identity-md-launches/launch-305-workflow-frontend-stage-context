import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { keccak256, toHex } from 'viem';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(root, 'dist');
const check = process.argv.includes('--check');
const handoff = JSON.parse(await readFile(resolve(root, 'web/deployment/handoff.json'), 'utf8'));
const { network, walletAddChain } = JSON.parse(await readFile(resolve(root, 'web/deployment/network.json'), 'utf8'));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(handoff.chainId === network.chainId && Number(walletAddChain.chainId) === network.chainId, 'Network mismatch');
assert(/^[a-f0-9]{40}$/.test(handoff.sourceCommit), 'Invalid source commit');
assert(handoff.contracts.length === 2 && handoff.contracts.some(c => c.name === 'KingOfTheHill') && handoff.contracts.some(c => c.name === 'LaunchToken'), 'Unexpected contracts');
const contracts = [];
for (const contract of handoff.contracts) {
  assert(/^[A-Za-z0-9_]+$/.test(contract.name), 'Unsafe contract name');
  const path = `docs/abi/${contract.name}.json`;
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:${path}`], { cwd: root });
  const current = await readFile(resolve(root, path));
  assert(pinned.equals(current), `ABI changed since pinned source: ${path}`);
  const abi = JSON.parse(pinned);
  assert(Array.isArray(abi), 'ABI must be a raw array');
  const abiHash = keccak256(toHex(JSON.stringify(canonical(abi)))).slice(2);
  assert(abiHash === contract.abiHash, `ABI hash mismatch: ${contract.name}`);
  const abiPath = `abi/${contract.name}.json`;
  if (check) assert(pinned.equals(await readFile(resolve(out, abiPath))), `Export ABI mismatch: ${abiPath}`);
  else { await mkdir(resolve(out, 'abi'), { recursive: true }); await writeFile(resolve(out, abiPath), pinned); }
  contracts.push({ name: contract.name, address: contract.address, abiHash, abiPath });
}
async function walk(dir) {
  const paths = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    assert(!item.isSymbolicLink(), 'Symlink in export');
    const path = resolve(dir, item.name);
    if (item.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}
const files = (await walk(out)).filter(path => relative(out, path) !== 'imd-deployment.json').sort();
assert(files.length <= 128 && files.some(path => relative(out, path) === 'index.html'), 'Invalid asset inventory');
let bytes = 0;
const assets = [];
for (const file of files) {
  const size = (await stat(file)).size;
  assert(size <= 8 * 1024 * 1024, `Oversized asset: ${file}`);
  bytes += size;
  assets.push({ path: relative(out, file), sha256: createHash('sha256').update(await readFile(file)).digest('hex') });
}
assert(bytes < 8 * 1024 * 1024, 'Export exhausts submission budget');
const manifest = {
  version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
  contracts, assets, network, walletAddChain,
  deploymentBlock: Math.min(...handoff.contracts.map(c => c.blockNumber)),
};
if (check) assert(JSON.stringify(canonical(manifest)) === JSON.stringify(canonical(JSON.parse(await readFile(resolve(out, 'imd-deployment.json'), 'utf8')))), 'Stale export manifest');
else await writeFile(resolve(out, 'imd-deployment.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${check ? 'Verified' : 'Exported'} ${assets.length} assets (${bytes} bytes); both pinned ABI Keccak hashes match. Network copied unchanged.`);
