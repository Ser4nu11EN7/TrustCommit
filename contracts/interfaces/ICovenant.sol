// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICovenant {
    enum CovenantStatus {
        None,
        Pending,
        Active,
        Submitted,
        Disputed,
        Completed,
        Cancelled,
        Slashed
    }

    struct CovenantState {
        CovenantStatus status;
        address creator;
        uint256 executorAgentId;
        uint128 reward;
        uint128 requiredStake;
        uint64 createdAt;
        uint64 deadline;
        bytes32 taskHash;
    }

    event CovenantCreated(
        bytes32 indexed covenantId,
        address indexed creator,
        uint256 indexed executorAgentId,
        uint128 reward,
        uint128 requiredStake,
        uint64 deadline,
        bytes32 taskHash
    );
    event CovenantAccepted(bytes32 indexed covenantId, address indexed signer, uint64 acceptedAt);
    event CompletionSubmitted(
        bytes32 indexed covenantId,
        bytes32 proofHash,
        bytes32 receiptHead,
        address indexed signer,
        uint64 submittedAt
    );
    event CovenantCompleted(bytes32 indexed covenantId, address indexed recipient, uint128 reward);
    event CovenantDisputed(bytes32 indexed covenantId, bytes32 evidenceHash, bytes32 proofHash, bytes32 receiptHead);
    event DisputeResolved(
        bytes32 indexed covenantId,
        bool executorWins,
        bytes32 resolutionHash,
        bytes32 evidenceHash,
        bytes32 receiptHead
    );
    event CancelApprovalGiven(bytes32 indexed covenantId, address indexed approver);
    event CovenantCancelled(bytes32 indexed covenantId);
    event CovenantSlashed(
        bytes32 indexed covenantId,
        address indexed receiver,
        uint128 stakeAmount,
        uint128 rewardRefunded,
        bytes32 reasonHash
    );

    function createCovenant(
        uint256 executorAgentId,
        uint128 reward,
        uint128 requiredStake,
        uint64 deadline,
        bytes32 taskHash
    ) external returns (bytes32 covenantId);

    function acceptCovenant(bytes32 covenantId) external;
    function submitCompletion(bytes32 covenantId, bytes32 proofHash, bytes32 receiptHead, bytes calldata operatorSignature) external;
    function finalizeCompletion(bytes32 covenantId) external;
    function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external;
    function resolveDispute(bytes32 covenantId, bool executorWins, bytes32 resolutionHash) external;
    function timeoutCovenant(bytes32 covenantId) external;
    function cancelCovenant(bytes32 covenantId) external;

    function covenants(bytes32 covenantId) external view returns (
        CovenantStatus status,
        address creator,
        uint256 executorAgentId,
        uint128 reward,
        uint128 requiredStake,
        uint64 createdAt,
        uint64 deadline,
        bytes32 taskHash
    );
    function completionSubmittedAt(bytes32 covenantId) external view returns (uint64);
    function completionProof(bytes32 covenantId) external view returns (bytes32);
    function proofCommitment(bytes32 proofHash) external view returns (bytes32);
    function completionReceiptHead(bytes32 covenantId) external view returns (bytes32);
    function completionSigner(bytes32 covenantId) external view returns (address);
    function disputeEvidence(bytes32 covenantId) external view returns (bytes32);
    function resolutionHash(bytes32 covenantId) external view returns (bytes32);
    function cancelApprovals(bytes32 covenantId, address approver) external view returns (bool);
    function minReward() external view returns (uint128);
}
