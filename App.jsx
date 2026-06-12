import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ABI, CONTRACT_ADDRESS, EXPECTED_CHAIN_ID, STATUS_LABELS } from "./contract";

function formatTimestamp(value) {
  const n = Number(value);
  if (!n) return "-";
  return new Date(n * 1000).toLocaleString();
}

function normalizeToHash(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Identity input is required");
  }

  if (/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    return trimmed;
  }

  return ethers.keccak256(ethers.toUtf8Bytes(trimmed));
}

export default function App() {
  const [account, setAccount] = useState("");
  const [isVerifier, setIsVerifier] = useState(false);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [identityInput, setIdentityInput] = useState("");
  const [verifyInput, setVerifyInput] = useState("");
  const [checkInput, setCheckInput] = useState("");
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const hasMetaMask = typeof window !== "undefined" && window.ethereum;

  const provider = useMemo(() => {
    if (!hasMetaMask) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasMetaMask]);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAccount("");
        setIsVerifier(false);
        setMessage("Wallet disconnected");
        return;
      }

      setAccount(accounts[0]);
      setMessage("Wallet account changed. Click Reconnect Wallet to refresh role status.");
    };

    const handleChainChanged = (chainHex) => {
      const parsed = Number(chainHex);
      setCurrentChainId(parsed);
      setMessage(`Network changed: ${parsed}. Click Reconnect Wallet.`);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  function formatError(error, fallback) {
    const message = error?.reason || error?.shortMessage || error?.message || fallback;
    if (message.includes("BAD_DATA") || message.includes("could not decode result data")) {
      return "Contract not found on the current network. Switch MetaMask to Sepolia and ensure VITE_CONTRACT_ADDRESS is the deployed Sepolia contract.";
    }
    if (message.toLowerCase().includes("failed to fetch")) {
      return "Unable to reach Sepolia RPC right now. Please retry in a moment, or reconnect wallet and try again.";
    }
    return message;
  }

  async function getReadProvider() {
    // Prefer wallet provider when connected because it is usually more reliable in browsers.
    if (provider && account) {
      await ensureCorrectNetwork();
      return provider;
    }

    const publicRpcCandidates = ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"];
    let lastError;

    for (const url of publicRpcCandidates) {
      try {
        const candidate = new ethers.JsonRpcProvider(url);
        await candidate.getNetwork();
        return candidate;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("No reachable Sepolia RPC endpoint found");
  }

  async function ensureCorrectNetwork() {
    if (!provider) {
      throw new Error("MetaMask is required");
    }

    const network = await provider.getNetwork();
    const currentChainId = Number(network.chainId);
    setCurrentChainId(currentChainId);

    if (currentChainId === EXPECTED_CHAIN_ID) {
      return;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${EXPECTED_CHAIN_ID.toString(16)}` }]
      });
      setCurrentChainId(EXPECTED_CHAIN_ID);
    } catch (switchError) {
      throw new Error(`Wrong network. Please switch MetaMask to chain ID ${EXPECTED_CHAIN_ID}.`);
    }
  }

  async function assertContractCode(readProvider) {
    const code = await readProvider.getCode(CONTRACT_ADDRESS);
    if (!code || code === "0x") {
      throw new Error(
        `No contract found at ${CONTRACT_ADDRESS} on this network. Please switch to Sepolia and verify VITE_CONTRACT_ADDRESS.`
      );
    }
  }

  async function getConnectedContract() {
    if (!provider) {
      throw new Error("MetaMask is required");
    }
    if (!CONTRACT_ADDRESS) {
      throw new Error("Missing VITE_CONTRACT_ADDRESS in frontend .env");
    }

    await ensureCorrectNetwork();
    await assertContractCode(provider);

    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    return { contract, signer };
  }

  async function connectWallet() {
    try {
      setMessage("");
      if (!provider) {
        throw new Error("MetaMask is not installed");
      }

      await provider.send("eth_requestAccounts", []);
      await ensureCorrectNetwork();

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      await assertContractCode(provider);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const verifierRole = await contract.VERIFIER_ROLE();
      const roleStatus = await contract.hasRole(verifierRole, signerAddress);

      setAccount(signerAddress);
      setIsVerifier(roleStatus);
      setMessage("Wallet connected successfully");
    } catch (error) {
      setMessage(formatError(error, "Failed to connect wallet"));
    }
  }

  const shortAccount = account ? `${account.slice(0, 8)}...${account.slice(-6)}` : "Not connected";
  const networkLabel = currentChainId ? `${currentChainId}` : "Unknown";
  const onExpectedNetwork = currentChainId === EXPECTED_CHAIN_ID;

  async function registerIdentity() {
    try {
      setBusy(true);
      setMessage("");
      const hash = normalizeToHash(identityInput);
      const { contract } = await getConnectedContract();
      const tx = await contract.registerIdentity(hash);
      await tx.wait();
      setMessage(`Identity registered. Hash: ${hash}`);
    } catch (error) {
      setMessage(formatError(error, "Registration failed"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyIdentity(action) {
    try {
      setBusy(true);
      setMessage("");
      const hash = normalizeToHash(verifyInput);
      const { contract } = await getConnectedContract();
      const tx =
        action === "verify" ? await contract.verifyIdentity(hash) : await contract.revokeIdentity(hash);
      await tx.wait();
      setMessage(`Identity ${action}d successfully for hash: ${hash}`);
    } catch (error) {
      setMessage(formatError(error, "Verifier action failed"));
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus() {
    try {
      setBusy(true);
      setMessage("");
      setResult(null);
      const hash = normalizeToHash(checkInput);

      if (!CONTRACT_ADDRESS) {
        throw new Error("Missing VITE_CONTRACT_ADDRESS in frontend .env");
      }

      const readProvider = await getReadProvider();
      await assertContractCode(readProvider);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, readProvider);
      const status = await contract.getIdentityStatus(hash);
      let approvalProgress = null;

      try {
        const progress = await contract.getApprovalProgress(hash);
        approvalProgress = {
          approvals: Number(progress.approvals),
          threshold: Number(progress.threshold)
        };
      } catch (progressError) {
        approvalProgress = null;
      }

      setResult({
        hash,
        statusCode: Number(status.status),
        statusLabel: STATUS_LABELS[Number(status.status)] || "Unknown",
        owner: status.owner,
        registeredAt: status.registeredAt,
        verifiedAt: status.verifiedAt,
        revokedAt: status.revokedAt,
        approvalProgress
      });
    } catch (error) {
      setMessage(formatError(error, "Status check failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="hero">
        <div className="hero-top">
          <div className="brand-block">
            <p className="eyebrow">Web3 Identity Infrastructure</p>
            <h1>Decentralized Identity Verification</h1>
            <p className="hero-copy">
              A secure identity rail where sensitive data stays private and only cryptographic proof reaches the chain.
            </p>
          </div>

          <div className="hero-actions">
            <button className="btn-primary" onClick={connectWallet} disabled={busy}>
              {busy ? "Processing..." : account ? "Reconnect Wallet" : "Connect Wallet"}
            </button>
            <div className="badge-row">
              <span className="badge">Account: {shortAccount}</span>
              <span className="badge">Verifier: {isVerifier ? "Authorized" : "No"}</span>
              <span className={`badge ${onExpectedNetwork ? "badge-ok" : "badge-warn"}`}>
                Chain: {networkLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="workflow">
          <span>1. Register hash</span>
          <span>2. Authority verifies</span>
          <span>3. Third party checks status</span>
        </div>
      </header>

      <main className="grid">
        <section className="card card-register">
          <h2>User Registration</h2>
          <p>Enter raw identity value (CNIC, student ID, email) or an existing keccak256 hash.</p>
          <label htmlFor="identityInput">Identity Input</label>
          <input
            id="identityInput"
            placeholder="e.g., cnic-3520112345678"
            value={identityInput}
            onChange={(e) => setIdentityInput(e.target.value)}
          />
          <button className="btn-primary" onClick={registerIdentity} disabled={busy}>
            {busy ? "Submitting..." : "Register Identity"}
          </button>
        </section>

        <section className="card card-check">
          <h2>Third-Party Status Check</h2>
          <p>Query verification state without exposing personal data.</p>
          <label htmlFor="checkInput">Identity or Hash</label>
          <input
            id="checkInput"
            placeholder="Identity text or 0x... hash"
            value={checkInput}
            onChange={(e) => setCheckInput(e.target.value)}
          />
          <button className="btn-secondary" onClick={checkStatus} disabled={busy}>
            {busy ? "Reading..." : "Check Status"}
          </button>

          {result && (
            <div className="result">
              <h3>Verification Result</h3>
              {result.approvalProgress && (
                <div className="approval-progress">
                  <div className="approval-head">
                    <span className="label">Multi-Verifier Approval</span>
                    <span className="value">
                      {result.approvalProgress.approvals}/{result.approvalProgress.threshold}
                    </span>
                  </div>
                  <div className="approval-track" aria-hidden="true">
                    <div
                      className="approval-fill"
                      style={{
                        width: `${Math.min(
                          100,
                          (result.approvalProgress.approvals / Math.max(1, result.approvalProgress.threshold)) * 100
                        )}%`
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="result-grid">
                <div>
                  <span className="label">Hash</span>
                  <span className="value mono">{result.hash}</span>
                </div>
                <div>
                  <span className="label">Status</span>
                  <span className="value status-pill">{result.statusLabel}</span>
                </div>
                <div>
                  <span className="label">Owner</span>
                  <span className="value mono">{result.owner}</span>
                </div>
                <div>
                  <span className="label">Registered</span>
                  <span className="value">{formatTimestamp(result.registeredAt)}</span>
                </div>
                <div>
                  <span className="label">Verified</span>
                  <span className="value">{formatTimestamp(result.verifiedAt)}</span>
                </div>
                <div>
                  <span className="label">Revoked</span>
                  <span className="value">{formatTimestamp(result.revokedAt)}</span>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card card-authority">
          <h2>Authority Verifier Panel</h2>
          <p>Only wallets with verifier role can approve or revoke identity records.</p>
          <label htmlFor="verifyInput">Identity or Hash</label>
          <input
            id="verifyInput"
            placeholder="Identity text or 0x... hash"
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
          />
          <div className="actions">
            <button className="btn-primary" onClick={() => verifyIdentity("verify")} disabled={busy || !isVerifier}>
              Verify
            </button>
            <button className="btn-ghost" onClick={() => verifyIdentity("revoke")} disabled={busy || !isVerifier}>
              Revoke
            </button>
          </div>
          {!isVerifier && <small className="hint">Connect an authorized verifier wallet to enable these actions.</small>}
        </section>
      </main>

      {message && <footer className="message">{message}</footer>}
    </div>
  );
}
