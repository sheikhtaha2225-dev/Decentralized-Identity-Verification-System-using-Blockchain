# Decentralized Identity Verification System

This repository contains a complete implementation of a decentralized identity verification system using blockchain smart contracts and a React + MetaMask frontend.

## Repository Structure

- `contracts/`: Solidity contract, Hardhat tests, and deployment scripts.
- `frontend/`: React application for user registration, verifier actions, and third-party status checks.
- `Decentralized-Identity-Verification-Proposal.md`: Full project proposal and architecture documentation.

## Features Implemented

- User registration with client-side hashing and on-chain storage of hash only.
- Role-based authority verification (admin and verifier roles).
- Third-party verification status checks without exposing personal data.
- Contract event logging for registration, verification, revocation, and role changes.
- Input validation and state validation in smart contract.
- Hardhat test suite for core flows and access control.
- MetaMask integration in frontend for secure transaction signing.

## Prerequisites

- Node.js 18+
- npm
- MetaMask browser extension

## 1) Smart Contract Setup

```bash
cd contracts
npm install
copy .env.example .env
npm run compile
npm test
```

### Deploy to Sepolia

1. Fill `contracts/.env` with `RPC_URL`, `PRIVATE_KEY`, and `ADMIN_ADDRESS`.
2. Deploy:

```bash
npm run deploy
```

3. Set `CONTRACT_ADDRESS` and `VERIFIER_ADDRESS` in `contracts/.env`.
4. Grant verifier role:

```bash
npm run grant:verifier
```

5. Export ABI for frontend:

```bash
npm run export:abi
```

## 2) Frontend Setup

```bash
cd frontend
npm install
copy .env.example .env
```

Update `frontend/.env`:

- `VITE_CONTRACT_ADDRESS`: deployed contract address.
- `VITE_CHAIN_ID`: network chain id (for Sepolia use `11155111`).

Run frontend:

```bash
npm run dev
```

## 3) Functional Verification Checklist

- Connect wallet with MetaMask.
- Register identity from raw text or precomputed hash.
- Verify identity from verifier wallet.
- Check status from any wallet or without wallet connected.
- Revoke verified identity from verifier wallet.

## Security Notes

- Never store plaintext personal data on-chain.
- Keep private keys out of source control.
- Use environment variables for secrets.
- Consider multi-verifier approval and audit logs for production.
