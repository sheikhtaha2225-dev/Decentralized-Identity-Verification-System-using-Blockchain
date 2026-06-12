import identityVerificationArtifact from "./abi/IdentityVerification.json";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "0x31f99371155df440e6C87E4451B9f5cdAD55508B";
export const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 11155111);

export const CONTRACT_ABI = identityVerificationArtifact.abi;

export const STATUS_LABELS = {
  0: "None",
  1: "Pending",
  2: "Verified",
  3: "Revoked"
};
