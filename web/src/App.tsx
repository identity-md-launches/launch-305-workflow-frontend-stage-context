import { useCallback, useEffect, useRef, useState } from 'react';
import { type Address, type EIP1193Provider, type Hash } from 'viem';
import { loadConfig, type LoadedConfig } from './config';
import { amount, exact, short, hasKing, isFresh, amountValue, claimProblem, connectRpc, readSnapshot, readClaims, switchNetwork, transact, errorText, type Service, type Snapshot, type ClaimEvent, type Action } from './chain';

function Crown({ large = false }: { large?: boolean }) {
  return <svg className={large ? 'crown-art' : 'brand-icon'} viewBox="0 0 120 100" fill="none" aria-hidden="true">
    <path d="M18 34 39 54 60 18 81 54 102 34 91 79H29L18 34Z" stroke="currentColor" strokeWidth={large ? '1.5' : '5'} />
    <path d="M29 88H91M39 54 45 79M81 54 75 79M60 18V79" stroke="currentColor" strokeWidth={large ? '1' : '3'} />
    <circle cx="60" cy="13" r="3" fill="currentColor" /><circle cx="15" cy="30" r="3" fill="currentColor" /><circle cx="105" cy="30" r="3" fill="currentColor" />
  </svg>;
}
function TokenValue({ value, decimals = 18 }: { value?: bigint; decimals?: number }) {
  return <span className="number" aria-label={value === undefined ? 'CRWN amount unavailable' : `${exact(value, decimals)} CRWN`} title={value === undefined ? undefined : `${exact(value, decimals)} CRWN`}>{value === undefined ? '—' : amount(value, decimals)} <span className="unit">CRWN</span></span>;
}
function App() {
  const [config, setConfig] = useState<LoadedConfig>();
  const [service, setService] = useState<Service>();
  const [state, setState] = useState<Snapshot>();
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [provider, setProvider] = useState<EIP1193Provider>();
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rpcError, setRpcError] = useState('');
  const [walletBusy, setWalletBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<Action>();
  const [hash, setHash] = useState<Hash>();
  const [input, setInput] = useState('');
  const [now, setNow] = useState(Date.now());
  const [claims, setClaims] = useState<ClaimEvent[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyBusy, setHistoryBusy] = useState(false);
  const [cursor, setCursor] = useState<bigint>();
  const [visibleClaims, setVisibleClaims] = useState(8);
  const [historyStart, setHistoryStart] = useState<bigint>();
  const epoch = useRef(0);
  const locked = useRef(false);
  const readId = useRef(0);
  const cursorRef = useRef<bigint | undefined>(undefined);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let cancelled = false;
    epoch.current++;
    setLoading(true); setRpcError(''); setService(undefined); setState(undefined);
    setClaims([]); setCursor(undefined); cursorRef.current = undefined;
    (async () => {
      try {
        const loaded = await loadConfig();
        if (cancelled) return;
        setConfig(loaded);
        const connected = await connectRpc(loaded, provider);
        if (!cancelled) setService(connected);
      } catch (error) { if (!cancelled) setRpcError(errorText(error)); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // Retry deliberately recreates and verifies the client; connecting a wallet alone leaves public reads stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retry]);

  useEffect(() => {
    if (!provider) return;
    const changed = (accounts: string[]) => {
      epoch.current++; setAccount(accounts[0] as Address | undefined); setState(undefined); setActionError('');
      setNotice(accounts.length ? 'Wallet changed.' : 'Wallet disconnected.');
    };
    const chainChanged = (id: string) => { epoch.current++; setWalletChain(Number(id)); setActionError(''); };
    const disconnected = () => { epoch.current++; setAccount(undefined); setWalletChain(undefined); setState(undefined); setNotice('Wallet disconnected.'); };
    provider.on('accountsChanged', changed); provider.on('chainChanged', chainChanged); provider.on('disconnect', disconnected);
    return () => { provider.removeListener('accountsChanged', changed); provider.removeListener('chainChanged', chainChanged); provider.removeListener('disconnect', disconnected); };
  }, [provider]);

  const refreshHistory = useCallback(async (active: Service, block: bigint) => {
    const identity = epoch.current;
    const deployed = BigInt(active.config.deployment.deploymentBlock);
    const from = block - 1999n > deployed ? block - 1999n : deployed;
    try {
      const recent = await readClaims(active, from, block);
      if (identity !== epoch.current) return;
      setClaims(old => [...recent, ...old.filter(event => event.block < from)]);
      setHistoryError('');
      if (cursorRef.current === undefined) { cursorRef.current = from; setCursor(from); setHistoryStart(from); }
    } catch (error) { if (identity === epoch.current) setHistoryError(`Claim history unavailable. ${errorText(error)}`); }
  }, []);
  const refresh = useCallback(async () => {
    if (!service) return;
    const id = ++readId.current;
    const identity = epoch.current;
    setRefreshing(true);
    try {
      const next = await readSnapshot(service, account);
      if (id !== readId.current || identity !== epoch.current) return;
      setState(next); setRpcError('');
      void refreshHistory(service, next.block);
    } catch (error) { if (id === readId.current && identity === epoch.current) setRpcError(`Live reads failed. ${errorText(error)}`); }
    finally { if (id === readId.current) setRefreshing(false); }
  }, [service, account, refreshHistory]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 12_000);
    const focus = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(timer); ++readId.current; document.removeEventListener('visibilitychange', focus); };
  }, [refresh]);

  async function connect() {
    if (walletBusy) return;
    setWalletBusy(true); setActionError('');
    try {
      const wallet = window.ethereum;
      if (!wallet) throw new Error('No browser wallet found. Open this page in a wallet browser or install an Ethereum wallet, then try again.');
      setProvider(wallet);
      const accounts = await wallet.request({ method: 'eth_requestAccounts' });
      if (!accounts.length) throw new Error('No wallet account selected. Open your wallet and try again.');
      const id = await wallet.request({ method: 'eth_chainId' });
      epoch.current++; setAccount(accounts[0]); setWalletChain(Number(id)); setState(undefined); setNotice('Wallet connected.');
      if (!service) setRetry(n => n + 1);
    } catch (error) { setActionError(errorText(error)); }
    finally { setWalletBusy(false); }
  }
  async function switchChain() {
    if (!provider || !config || walletBusy) return;
    setWalletBusy(true); setActionError('');
    try { await switchNetwork(provider, config); setWalletChain(Number(await provider.request({ method: 'eth_chainId' }))); void refresh(); }
    catch (error) { setActionError(errorText(error)); }
    finally { setWalletBusy(false); }
  }
  function disconnect() {
    epoch.current++; setAccount(undefined); setProvider(undefined); setWalletChain(undefined); setState(undefined); setNotice('Wallet disconnected from this page.'); setActionError('');
  }
  async function run(action: Action) {
    if (!service || !provider || !account || locked.current || !ready) return;
    locked.current = true; setBusy(action); setActionError(''); setHash(undefined);
    const identity = epoch.current;
    try {
      await transact(service, provider, account, action, value, (message, txHash) => { setNotice(message); if (txHash) setHash(txHash); }, () => epoch.current === identity);
      await refresh();
    } catch (error) { setActionError(errorText(error)); setNotice(''); void refresh(); }
    finally { locked.current = false; setBusy(undefined); }
  }
  async function olderClaims() {
    if (!service || cursor === undefined || historyBusy) return;
    setHistoryBusy(true);
    const deployed = BigInt(service.config.deployment.deploymentBlock);
    const from = cursor - 2000n > deployed ? cursor - 2000n : deployed;
    try {
      const older = await readClaims(service, from, cursor - 1n);
      setClaims(old => [...old, ...older.filter(event => !old.some(existing => existing.hash === event.hash && existing.index === event.index))]);
      setCursor(from); cursorRef.current = from; setHistoryStart(from); setHistoryError(''); setVisibleClaims(n => n + 8);
    } catch (error) { setHistoryError(`Older claims could not load. Try again. ${errorText(error)}`); }
    finally { setHistoryBusy(false); }
  }

  const explorer = config?.deployment.network.explorer;
  const networkName = config?.chain.name || 'network';
  const wrongChain = !!account && walletChain !== config?.chain.id;
  const fresh = !!state && isFresh(state);
  const ready = !!account && !!state && fresh && !wrongChain && !rpcError && !busy && state.account?.toLowerCase() === account.toLowerCase();
  const value = amountValue(input, service?.decimals || 18);
  const problem = !account ? 'Connect your wallet to approve CRWN and claim.' : wrongChain ? `Switch to ${networkName} to play.` : !state ? 'Loading contract state…' : claimProblem(state, account, value);
  const canClaim = ready && !problem;
  const approved = !!value && !!state && state.allowance >= value;
  const occupied = !!state && hasKing(state);
  const remaining = state && occupied ? Math.max(0, Number(state.deadline - state.timestamp) - Math.floor((now - state.fetchedAt) / 1000)) : 0;
  const countdown = !state ? '— : — : —' : !occupied ? '24 : 00 : 00' : `${Math.floor(remaining / 3600).toString().padStart(2, '0')} : ${Math.floor(remaining % 3600 / 60).toString().padStart(2, '0')} : ${(remaining % 60).toString().padStart(2, '0')}`;
  const settleReady = ready && occupied && !!state && state.timestamp >= state.deadline;
  const fieldError = !!input && !!account && !!state && !wrongChain && !!problem;
  const AddressLink = ({ address, label }: { address: Address; label?: string }) => <a className="address" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" title={address} aria-label={`${label || 'Address'} ${address} on explorer`}>{label || short(address)} <span aria-hidden="true">↗</span></a>;

  return <>
    <a href="#main" className="skip-link">Skip to game</a>
    <div className="page">
      <header className="site-header">
        <a className="brand" href="#main" aria-label="Crown home"><Crown /><span>Crown<span className="brand-caption">King of the hill</span></span></a>
        <div className="wallet-nav">
          <span className="network-tag"><span className="dot" />{config ? networkName : 'Test network'}<span className="testnet">Testnet</span></span>
          {account ? <div className="connected"><span className="wallet-address" title={account}>{short(account)}</span><button className="button compact" onClick={disconnect} disabled={!!busy}>Disconnect</button></div> : <button className="button connect" onClick={connect} disabled={walletBusy}>{walletBusy ? 'Connecting…' : 'Connect wallet'} <span aria-hidden="true">↗</span></button>}
        </div>
      </header>
      <main id="main">
        <section className="intro" aria-labelledby="page-title">
          <div><p className="eyebrow">A game of timing & conviction</p><h1 id="page-title">One throne.<br /><em>Twenty-four hours.</em></h1></div>
          <div className="intro-note"><span className="note-mark" aria-hidden="true">01 — ∞</span><p>Claim the crown with CRWN. <br />Hold it for 24 hours to end the round. <br />Every challenger resets the clock.</p><a href="#rules">Understand the stakes <span aria-hidden="true">↓</span></a></div>
        </section>

        {wrongChain && <div className="banner warning"><div><strong>Wallet is on another network.</strong><p>This game runs on {networkName}. Switch networks to use the controls.</p></div><button className="button" onClick={switchChain} disabled={walletBusy}>{walletBusy ? 'Switching…' : `Switch to ${networkName}`}</button></div>}
        {rpcError && <div className="banner error" role="alert"><div><strong>Live connection unavailable</strong><p>{rpcError}</p></div><button className="button" onClick={() => setRetry(n => n + 1)}>Retry connection</button></div>}
        {state && !fresh && !rpcError && <div className="banner warning" role="status">Chain data is stale. Actions are paused until a current block is available.<button className="button" onClick={() => void refresh()} disabled={refreshing}>Refresh state</button></div>}

        <div className="game-grid">
          <section className="throne-card" aria-labelledby="round-heading">
            <div className="card-top"><h2 className="eyebrow" id="round-heading">Round {state?.round.toString() || '—'}</h2><span className="round-status"><span className="dot" />{!state ? (loading ? 'Connecting' : 'Awaiting data') : !fresh ? 'Stale data' : !occupied ? 'Open throne' : remaining === 0 ? 'Ready to settle' : 'Round active'}</span></div>
            <div className="throne-center"><div className="crown-orbit"><Crown large /></div><p className="eyebrow">The current king</p><div className="king">{!state ? 'Reading the throne…' : occupied ? <AddressLink address={state.king} /> : 'The throne awaits.'}</div><p className="king-caption">{state && occupied ? <>Paid <TokenValue value={state.kingPayment} /></> : 'The first claim starts the clock.'}</p></div>
            <div className="round-stats"><div><p className="stat-label">The pot</p><div className="pot"><TokenValue value={state?.pot} /></div></div><div className="timer-block"><p className="stat-label">{!occupied ? 'Time to hold' : remaining === 0 ? 'Time is up' : 'Time remaining'}</p><div className="timer" aria-label={`Countdown ${countdown}`}>{countdown}</div></div></div>
            <div className="settle-row"><p>{!state ? 'Waiting for live round data.' : !occupied ? 'A new round. A new beginning.' : remaining === 0 ? 'Anyone can settle. The pot is credited to the king.' : 'The pot goes to the final king after settlement.'}</p><button className="button dark-button" disabled={!settleReady} onClick={() => run('settle')}>{busy === 'settle' ? 'Settling…' : 'Settle round'} <span aria-hidden="true">↗</span></button></div>
            {occupied && state && <p className="deadline">Deadline: {new Date(Number(state.deadline) * 1000).toLocaleString(undefined, { timeZone: 'UTC' })} UTC · block time decides</p>}
          </section>

          <section className="claim-card" aria-labelledby="claim-heading">
            <div className="card-top"><p className="eyebrow">Make your move</p><span className="small-crown" aria-hidden="true">♔</span></div>
            <h2 id="claim-heading">Claim the throne</h2><p className="muted">A higher claim takes the crown and restarts the 24-hour clock.</p>
            <div className="minimum"><span>Next minimum claim</span><strong><TokenValue value={state?.minimum} /></strong></div>
            <label htmlFor="claim-amount">Your claim amount</label>
            <div className={`amount-input ${fieldError ? 'invalid' : ''}`}><input id="claim-amount" name="claimAmount" inputMode="decimal" autoComplete="off" placeholder={state ? exact(state.minimum) : 'Enter amount'} value={input} onChange={e => setInput(e.target.value)} aria-invalid={fieldError} aria-describedby="amount-help" disabled={!!busy} /><span>CRWN</span><button className="minimum-button" onClick={() => state && setInput(exact(state.minimum))} disabled={!state || !!busy}>Use minimum</button></div>
            <p className={`field-help ${fieldError ? 'field-error' : ''}`} id="amount-help">{problem || `You will pay ${exact(value!)} CRWN to KingOfTheHill.`}</p>
            <div className="transaction-steps">
              <div className="step"><span className="step-number">1</span><div><strong>Approve CRWN</strong><span>{approved ? 'Current allowance covers this claim.' : 'Allow the game to use your entered amount.'}</span></div><span className="step-state">{approved ? 'Ready' : 'Required'}</span></div>
              <button className={`button wide ${!approved ? 'primary' : ''}`} onClick={() => run('approve')} disabled={!canClaim || approved}>{busy === 'approve' ? 'Approving…' : approved ? 'CRWN allowance ready' : 'Approve CRWN'}{!approved && <span aria-hidden="true">↗</span>}</button>
              <div className="step"><span className="step-number">2</span><div><strong>Take the crown</strong><span>Pay CRWN in a separate transaction.</span></div></div>
              <button className={`button wide ${approved ? 'primary' : ''}`} onClick={() => run('claim')} disabled={!canClaim || !approved}>{busy === 'claim' ? 'Claiming…' : 'Claim the throne'} <span aria-hidden="true">↗</span></button>
            </div>
            <p className="claim-footnote">Approval permits spending; it does not pay the game. Each transaction also needs a little Sepolia ETH for gas.</p>
          </section>
        </div>

        <div className="transaction-feedback" aria-live="polite" role="status">{notice}{hash && explorer && <> <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a></>}</div>
        <div className="action-error" role="alert">{actionError}</div>

        <section className="wallet-panel" aria-labelledby="wallet-heading"><div className="wallet-panel-title"><h2 id="wallet-heading">Your CRWN</h2><p>{account ? <AddressLink address={account} /> : 'Connect to see your balances'}</p></div><div><p className="stat-label">Wallet balance</p><TokenValue value={account && state?.account === account ? state.balance : undefined} /></div><div><p className="stat-label">Game allowance</p><TokenValue value={account && state?.account === account ? state.allowance : undefined} /></div><div className="withdraw-block"><div><p className="stat-label">Ready to withdraw</p><TokenValue value={account && state?.account === account ? state.withdrawable : undefined} /></div><button className="button" disabled={!ready || !state?.withdrawable} onClick={() => run('withdraw')}>{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw CRWN'} <span aria-hidden="true">↗</span></button></div></section>

        {state && <details className="exact-values"><summary>Show exact CRWN amounts</summary><p>Compact amounts above show up to four decimal places. These values preserve all 18 decimals of precision.</p><dl><dt>Pot</dt><dd>{exact(state.pot)} CRWN</dd><dt>King’s payment</dt><dd>{exact(state.kingPayment)} CRWN</dd><dt>Next minimum claim</dt><dd>{exact(state.minimum)} CRWN</dd>{account && state.account === account && <><dt>Wallet balance</dt><dd>{exact(state.balance)} CRWN</dd><dt>Game allowance</dt><dd>{exact(state.allowance)} CRWN</dd><dt>Withdrawable</dt><dd>{exact(state.withdrawable)} CRWN</dd></>}</dl></details>}

        <section className="rules-section" id="rules" aria-labelledby="rules-heading"><div><p className="eyebrow">Know the stakes</p><h2 id="rules-heading">A crown comes <br />at a cost.</h2></div><div className="rules-copy"><p><strong>If you’re dethroned,</strong> your payment plus 5% of the new claim is credited to you. Collect it with Withdraw CRWN.</p><p><strong>If you’re the final king,</strong> you receive the pot only. Your payment is already part of the game’s accounting; it is not added back. After multiple claims, the pot is less than what you paid. <strong>That loss is your stake.</strong></p><details><summary>Read the round rules</summary><p>The first claim costs at least 1,000 CRWN and goes entirely to the pot. Later claims must pay at least 110% of the previous payment, rounded up to the smallest CRWN unit. The current king cannot claim again.</p><p>Each later claim credits the previous king their payment plus a 5% bonus, rounded down, and adds the remainder to the pot. A claim must land before the deadline. At the exact deadline, settlement becomes available and starts a new round.</p><p>The final king receives their full payment only if they were the round’s sole claimant. After a long chain of minimum raises, the pot approaches about 45% of the final payment. All payouts must be withdrawn by their recipient. There is no owner, pause control, or automatic payout.</p></details></div><div className="get-token"><span className="eyebrow">Before you play</span><h3>Need CRWN?</h3><p>CRWN comes from swapping Sepolia ETH in the launch’s Uniswap v4 pool. Swap externally, then return here to play.</p>{config && <><AddressLink address={config.token.address} label="View CRWN token" /><details><summary>Pool & network details</summary><p>Native ETH / CRWN · 0.3% fee · tick spacing 60 · no hook.</p><p>Test tokens on {networkName}. No swap or quote is performed on this page.</p><AddressLink address={config.deployment.network.uniswapV4.poolManager} label="View pool manager" />{config.deployment.network.faucets.map((url, index) => <p key={url}><a href={url} target="_blank" rel="noreferrer">Sepolia ETH faucet {index + 1} ↗</a></p>)}</details></>}</div></section>

        <section className="history-section" aria-labelledby="history-heading"><div className="section-heading"><div><p className="eyebrow">From the contract</p><h2 id="history-heading">Claim history</h2></div><button className="button compact" disabled={!service || refreshing} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh state'} <span aria-hidden="true">↻</span></button></div>
          <p className="history-range">{historyStart !== undefined && state ? `Loaded blocks ${historyStart.toLocaleString()}–${state.block.toLocaleString()}. Newest first; load older blocks below.` : 'Reading claim events directly from the contract.'}</p>
          {historyError && <p className="field-error" role="status">{historyError}</p>}
          {!claims.length ? <div className="history-empty"><span aria-hidden="true">♔</span><p>{!state ? 'Claim history will appear when the live connection is ready.' : historyError ? 'History could not be read. Use Refresh state to retry.' : 'No claims in the loaded block range.'}</p></div> : <div><p className="table-hint">Scroll sideways to see every history column.</p><div className="table-wrap" role="region" aria-label="Claim history table; scroll horizontally for all columns" tabIndex={0}><table><caption className="sr-only">Claims from loaded contract event blocks</caption><thead><tr><th scope="col">Round</th><th scope="col">King</th><th scope="col">Paid (CRWN)</th><th scope="col">Bonus (CRWN)</th><th scope="col">Transaction</th></tr></thead><tbody>{claims.slice(0, visibleClaims).map(event => <tr key={`${event.hash}-${event.index}`}><td>#{event.round.toString()}</td><td><AddressLink address={event.king} /></td><td title={exact(event.amount)}>{amount(event.amount)}</td><td title={exact(event.bonus)}>{amount(event.bonus)}</td><td><a href={`${explorer}/tx/${event.hash}`} target="_blank" rel="noreferrer" aria-label={`View claim transaction ${event.hash}`}>{short(event.hash)} ↗</a></td></tr>)}</tbody></table></div></div>}
          <div className="history-actions">{claims.length > visibleClaims && <button className="button compact" onClick={() => setVisibleClaims(n => n + 8)}>Show more loaded claims</button>}{cursor !== undefined && config && cursor > BigInt(config.deployment.deploymentBlock) && <button className="button compact" onClick={olderClaims} disabled={historyBusy}>{historyBusy ? 'Loading older blocks…' : 'Load older blocks'}</button>}</div>
        </section>
      </main>
      <footer><div className="footer-brand"><Crown /><span>Crown <span className="muted">/ An onchain game</span></span></div><div className="footer-links">{config && <><AddressLink address={config.game.address} label="Game contract" /><AddressLink address={config.token.address} label="CRWN contract" /><a href="./imd-deployment.json" target="_blank" rel="noreferrer">Deployment ↗</a></>}</div><p className="read-status">{state && service ? `Read at block ${state.block.toLocaleString()} via ${service.label}. Refreshes every 12 seconds.` : 'Waiting for verified contract reads.'}</p></footer>
    </div>
  </>;
}
export default App;
