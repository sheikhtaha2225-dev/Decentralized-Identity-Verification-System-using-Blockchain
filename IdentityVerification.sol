// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract IdentityVerification is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    uint256 public requiredApprovals;

    enum Status {
        None,
        Pending,
        Verified,
        Revoked
    }

    struct IdentityRecord {
        address owner;
        Status status;
        uint64 registeredAt;
        uint64 verifiedAt;
        uint64 revokedAt;
        uint64 verificationRound;
        bool exists;
    }

    error InvalidHash();
    error IdentityAlreadyActive();
    error IdentityNotFound();
    error InvalidState();
    error ReRegistrationNotAllowed();
    error AlreadyApproved();
    error InvalidThreshold();

    mapping(bytes32 => IdentityRecord) private records;
    mapping(address => bytes32[]) private ownerIdentityHashes;
    mapping(bytes32 => uint256) private approvalCounts;
    mapping(bytes32 => mapping(uint64 => mapping(address => bool))) private hasApprovedInRound;

    event IdentityRegistered(bytes32 indexed identityHash, address indexed owner, uint64 timestamp);
    event IdentityApprovalSubmitted(
        bytes32 indexed identityHash,
        address indexed verifier,
        uint256 currentApprovals,
        uint256 requiredApprovals,
        uint64 timestamp
    );
    event IdentityVerified(bytes32 indexed identityHash, address indexed verifier, uint64 timestamp);
    event IdentityRevoked(bytes32 indexed identityHash, address indexed verifier, uint64 timestamp);
    event VerifierAdded(address indexed verifier, address indexed admin);
    event VerifierRemoved(address indexed verifier, address indexed admin);
    event RequiredApprovalsUpdated(uint256 oldValue, uint256 newValue, address indexed admin);

    constructor(address admin) {
        require(admin != address(0), "admin cannot be zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        requiredApprovals = 2;
    }

    function registerIdentity(bytes32 identityHash) external {
        if (identityHash == bytes32(0)) revert InvalidHash();

        IdentityRecord storage existing = records[identityHash];
        bool hasRecord = existing.exists;

        if (hasRecord && existing.status != Status.Revoked) {
            revert IdentityAlreadyActive();
        }

        if (!hasRecord) {
            ownerIdentityHashes[msg.sender].push(identityHash);
        } else if (existing.owner != msg.sender) {
            revert ReRegistrationNotAllowed();
        }

        records[identityHash] = IdentityRecord({
            owner: msg.sender,
            status: Status.Pending,
            registeredAt: uint64(block.timestamp),
            verifiedAt: 0,
            revokedAt: 0,
            verificationRound: hasRecord ? existing.verificationRound + 1 : 1,
            exists: true
        });

        approvalCounts[identityHash] = 0;

        emit IdentityRegistered(identityHash, msg.sender, uint64(block.timestamp));
    }

    function verifyIdentity(bytes32 identityHash) external onlyRole(VERIFIER_ROLE) {
        IdentityRecord storage record = records[identityHash];
        if (!record.exists) revert IdentityNotFound();
        if (record.status != Status.Pending) revert InvalidState();

        uint64 currentRound = record.verificationRound;
        if (hasApprovedInRound[identityHash][currentRound][msg.sender]) revert AlreadyApproved();

        hasApprovedInRound[identityHash][currentRound][msg.sender] = true;
        uint256 approvals = ++approvalCounts[identityHash];

        emit IdentityApprovalSubmitted(identityHash, msg.sender, approvals, requiredApprovals, uint64(block.timestamp));

        if (approvals < requiredApprovals) {
            return;
        }

        record.status = Status.Verified;
        record.verifiedAt = uint64(block.timestamp);

        emit IdentityVerified(identityHash, msg.sender, uint64(block.timestamp));
    }

    function revokeIdentity(bytes32 identityHash) external onlyRole(VERIFIER_ROLE) {
        IdentityRecord storage record = records[identityHash];
        if (!record.exists) revert IdentityNotFound();
        if (record.status != Status.Verified) revert InvalidState();

        record.status = Status.Revoked;
        record.revokedAt = uint64(block.timestamp);

        emit IdentityRevoked(identityHash, msg.sender, uint64(block.timestamp));
    }

    function addVerifier(address verifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(verifier != address(0), "invalid verifier");
        _grantRole(VERIFIER_ROLE, verifier);
        emit VerifierAdded(verifier, msg.sender);
    }

    function setRequiredApprovals(uint256 newValue) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newValue == 0) revert InvalidThreshold();
        uint256 oldValue = requiredApprovals;
        requiredApprovals = newValue;
        emit RequiredApprovalsUpdated(oldValue, newValue, msg.sender);
    }

    function removeVerifier(address verifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VERIFIER_ROLE, verifier);
        emit VerifierRemoved(verifier, msg.sender);
    }

    function getIdentityStatus(
        bytes32 identityHash
    )
        external
        view
        returns (Status status, address owner, uint64 registeredAt, uint64 verifiedAt, uint64 revokedAt)
    {
        IdentityRecord memory record = records[identityHash];
        if (!record.exists) revert IdentityNotFound();
        return (record.status, record.owner, record.registeredAt, record.verifiedAt, record.revokedAt);
    }

    function isVerified(bytes32 identityHash) external view returns (bool) {
        IdentityRecord memory record = records[identityHash];
        return record.exists && record.status == Status.Verified;
    }

    function getApprovalProgress(bytes32 identityHash) external view returns (uint256 approvals, uint256 threshold) {
        IdentityRecord memory record = records[identityHash];
        if (!record.exists) revert IdentityNotFound();
        return (approvalCounts[identityHash], requiredApprovals);
    }

    function hasVerifierApproved(bytes32 identityHash, address verifier) external view returns (bool) {
        IdentityRecord memory record = records[identityHash];
        if (!record.exists) revert IdentityNotFound();
        return hasApprovedInRound[identityHash][record.verificationRound][verifier];
    }

    function getOwnerIdentityHashes(address owner) external view returns (bytes32[] memory) {
        return ownerIdentityHashes[owner];
    }
}
