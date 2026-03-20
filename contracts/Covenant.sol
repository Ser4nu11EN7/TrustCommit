// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICovenant.sol";
import "./interfaces/ITrustRegistry.sol";

contract Covenant is AccessControl, Pausable, ReentrancyGuard, EIP712, ICovenant {
    using SafeERC20 for IERC20;

    error InvalidRegistry();
    error InvalidToken();
    error InvalidArbiter();
    error RewardTooLow();
    error StakeMustBePositive();
    error InvalidDeadline();
    error InvalidTaskHash();
    error AgentNotActive();
    error NotPending();
    error DeadlinePassed();
    error OnlyExecutionWallet();
    error InsufficientFreeStake();
    error InvalidStatus();
    error InvalidProofHash();
    error InvalidReceiptHead();
    error MissingOperatorSignature();
    error AlreadySubmitted();
    error ProofAlreadyCommitted();
    error InvalidExecutionWallet();
    error InvalidOperatorAttestation();
    error NotSubmitted();
    error DisputeWindowActive();
    error MissingAnchoredReceiptHead();
    error MissingCompletionSigner();
    error OnlyCreator();
    error InvalidEvidenceHash();
    error DisputeWindowClosed();
    error MissingDisputeEvidence();
    error NotExpired();
    error NotAuthorized();
    error ApprovalAlreadyGiven();

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    uint64 public constant DISPUTE_WINDOW = 7 days;
    bytes32 private constant TIMEOUT_REASON_HASH = keccak256("TIMEOUT");
    bytes32 private constant SUBMIT_COMPLETION_TYPEHASH =
        keccak256("SubmitCompletion(bytes32 covenantId,bytes32 taskHash,bytes32 proofHash,bytes32 receiptHead)");

    IERC20 public immutable paymentToken;
    ITrustRegistry public immutable trustRegistry;
    uint128 public immutable minReward;

    uint256 private _nextNonce;

    mapping(bytes32 => CovenantState) public covenants;
    mapping(bytes32 => uint64) public completionSubmittedAt;
    mapping(bytes32 => bytes32) public completionProof;
    mapping(bytes32 => bytes32) public proofCommitment;
    mapping(bytes32 => bytes32) public completionReceiptHead;
    mapping(bytes32 => address) public completionSigner;
    mapping(bytes32 => bytes32) public disputeEvidence;
    mapping(bytes32 => bytes32) public resolutionHash;
    mapping(bytes32 => mapping(address => bool)) public cancelApprovals;

    constructor(address _trustRegistry, address _paymentToken, address _initialArbiter, uint128 _minReward)
        EIP712("TrustCommitCovenant", "1")
    {
        if (_trustRegistry == address(0)) revert InvalidRegistry();
        if (_paymentToken == address(0)) revert InvalidToken();
        if (_initialArbiter == address(0)) revert InvalidArbiter();

        trustRegistry = ITrustRegistry(_trustRegistry);
        paymentToken = IERC20(_paymentToken);
        minReward = _minReward;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ARBITER_ROLE, _initialArbiter);
    }

    function createCovenant(
        uint256 executorAgentId,
        uint128 reward,
        uint128 requiredStake,
        uint64 deadline,
        bytes32 taskHash
    ) external nonReentrant whenNotPaused returns (bytes32 covenantId) {
        if (reward < minReward) revert RewardTooLow();
        if (requiredStake == 0) revert StakeMustBePositive();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (taskHash == bytes32(0)) revert InvalidTaskHash();

        ITrustRegistry.AgentState memory agent = trustRegistry.getAgentState(executorAgentId);
        if (agent.status != ITrustRegistry.AgentStatus.Active) revert AgentNotActive();

        uint256 nonce = _nextNonce++;
        covenantId = keccak256(abi.encode(msg.sender, executorAgentId, nonce));

        covenants[covenantId] = CovenantState({
            status: CovenantStatus.Pending,
            creator: msg.sender,
            executorAgentId: executorAgentId,
            reward: reward,
            requiredStake: requiredStake,
            createdAt: uint64(block.timestamp),
            deadline: deadline,
            taskHash: taskHash
        });

        uint256 balanceBefore = paymentToken.balanceOf(address(this));
        paymentToken.safeTransferFrom(msg.sender, address(this), reward);
        uint256 received = paymentToken.balanceOf(address(this)) - balanceBefore;
        if (received != reward) revert InvalidToken();

        emit CovenantCreated(covenantId, msg.sender, executorAgentId, reward, requiredStake, deadline, taskHash);
    }

    function acceptCovenant(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Pending) revert NotPending();
        if (block.timestamp > covenant.deadline) revert DeadlinePassed();

        address executionWallet = _executionWallet(covenant.executorAgentId);
        if (msg.sender != executionWallet) revert OnlyExecutionWallet();

        ITrustRegistry.AgentState memory agent = trustRegistry.getAgentState(covenant.executorAgentId);
        if (agent.status != ITrustRegistry.AgentStatus.Active) revert AgentNotActive();

        uint128 availableStake = trustRegistry.stakeBalance(covenant.executorAgentId) - trustRegistry.lockedTotal(covenant.executorAgentId);
        if (availableStake < covenant.requiredStake) revert InsufficientFreeStake();

        trustRegistry.lockStake(covenant.executorAgentId, covenantId, covenant.requiredStake);
        covenant.status = CovenantStatus.Active;

        emit CovenantAccepted(covenantId, executionWallet, uint64(block.timestamp));
    }

    function submitCompletion(
        bytes32 covenantId,
        bytes32 proofHash,
        bytes32 receiptHead,
        bytes calldata operatorSignature
    ) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Active) revert InvalidStatus();
        if (block.timestamp > covenant.deadline) revert DeadlinePassed();
        if (proofHash == bytes32(0)) revert InvalidProofHash();
        if (receiptHead == bytes32(0)) revert InvalidReceiptHead();
        if (operatorSignature.length == 0) revert MissingOperatorSignature();
        if (completionProof[covenantId] != bytes32(0)) revert AlreadySubmitted();
        if (proofCommitment[proofHash] != bytes32(0)) revert ProofAlreadyCommitted();

        address executionWallet = _executionWallet(covenant.executorAgentId);
        if (executionWallet == address(0)) revert InvalidExecutionWallet();
        if (_recoverSubmissionSigner(covenantId, covenant.taskHash, proofHash, receiptHead, operatorSignature) != executionWallet) {
            revert InvalidOperatorAttestation();
        }

        covenant.status = CovenantStatus.Submitted;
        completionSubmittedAt[covenantId] = uint64(block.timestamp);
        completionProof[covenantId] = proofHash;
        proofCommitment[proofHash] = covenantId;
        completionReceiptHead[covenantId] = receiptHead;
        completionSigner[covenantId] = executionWallet;

        emit CompletionSubmitted(covenantId, proofHash, receiptHead, executionWallet, uint64(block.timestamp));
    }

    function finalizeCompletion(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Submitted) revert NotSubmitted();
        if (block.timestamp < completionSubmittedAt[covenantId] + DISPUTE_WINDOW) revert DisputeWindowActive();
        if (completionReceiptHead[covenantId] == bytes32(0)) revert MissingAnchoredReceiptHead();
        if (completionSigner[covenantId] == address(0)) revert MissingCompletionSigner();

        _completeCovenant(covenantId, covenant);
    }

    function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (msg.sender != covenant.creator) revert OnlyCreator();
        if (evidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        if (covenant.status != CovenantStatus.Submitted) revert NotSubmitted();
        if (block.timestamp >= completionSubmittedAt[covenantId] + DISPUTE_WINDOW) revert DisputeWindowClosed();

        covenant.status = CovenantStatus.Disputed;
        disputeEvidence[covenantId] = evidenceHash;

        emit CovenantDisputed(covenantId, evidenceHash, completionProof[covenantId], completionReceiptHead[covenantId]);
    }

    function resolveDispute(bytes32 covenantId, bool executorWins, bytes32 _resolutionHash)
        external
        onlyRole(ARBITER_ROLE)
        nonReentrant
        whenNotPaused
    {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Disputed) revert InvalidStatus();
        if (_resolutionHash == bytes32(0)) revert InvalidProofHash();
        if (disputeEvidence[covenantId] == bytes32(0)) revert MissingDisputeEvidence();

        resolutionHash[covenantId] = _resolutionHash;
        emit DisputeResolved(
            covenantId,
            executorWins,
            _resolutionHash,
            disputeEvidence[covenantId],
            completionReceiptHead[covenantId]
        );

        if (executorWins) {
            _completeCovenant(covenantId, covenant);
        } else {
            _slashCovenant(covenantId, covenant, covenant.creator, _resolutionHash);
        }
    }

    function timeoutCovenant(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Pending && covenant.status != CovenantStatus.Active) revert InvalidStatus();
        if (block.timestamp <= covenant.deadline) revert NotExpired();

        if (covenant.status == CovenantStatus.Pending) {
            covenant.status = CovenantStatus.Cancelled;
            paymentToken.safeTransfer(covenant.creator, covenant.reward);
            emit CovenantCancelled(covenantId);
            return;
        }

        _slashCovenant(covenantId, covenant, covenant.creator, TIMEOUT_REASON_HASH);
    }

    function cancelCovenant(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        if (covenant.status != CovenantStatus.Pending && covenant.status != CovenantStatus.Active) revert InvalidStatus();
        if (block.timestamp > covenant.deadline) revert DeadlinePassed();

        if (covenant.status == CovenantStatus.Pending) {
            address executionWallet = _executionWallet(covenant.executorAgentId);
            address pendingExecutorOwner = _executorOwner(covenant.executorAgentId);
            if (msg.sender != covenant.creator && msg.sender != pendingExecutorOwner && msg.sender != executionWallet) {
                revert NotAuthorized();
            }
            covenant.status = CovenantStatus.Cancelled;
            paymentToken.safeTransfer(covenant.creator, covenant.reward);
            emit CovenantCancelled(covenantId);
            return;
        }

        address activeExecutorOwner = _executorOwner(covenant.executorAgentId);
        if (msg.sender != covenant.creator && msg.sender != activeExecutorOwner) revert NotAuthorized();
        if (cancelApprovals[covenantId][msg.sender]) revert ApprovalAlreadyGiven();

        cancelApprovals[covenantId][msg.sender] = true;
        emit CancelApprovalGiven(covenantId, msg.sender);

        if (cancelApprovals[covenantId][covenant.creator] && cancelApprovals[covenantId][activeExecutorOwner]) {
            covenant.status = CovenantStatus.Cancelled;
            trustRegistry.unlockStake(covenant.executorAgentId, covenantId);
            paymentToken.safeTransfer(covenant.creator, covenant.reward);
            emit CovenantCancelled(covenantId);
        }
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _completeCovenant(bytes32 covenantId, CovenantState storage covenant) internal {
        covenant.status = CovenantStatus.Completed;
        trustRegistry.unlockStake(covenant.executorAgentId, covenantId);
        paymentToken.safeTransfer(_executorOwner(covenant.executorAgentId), covenant.reward);
        emit CovenantCompleted(covenantId, _executorOwner(covenant.executorAgentId), covenant.reward);
    }

    function _slashCovenant(
        bytes32 covenantId,
        CovenantState storage covenant,
        address receiver,
        bytes32 reasonHash
    ) internal {
        covenant.status = CovenantStatus.Slashed;
        trustRegistry.slash(
            covenant.executorAgentId,
            covenantId,
            covenant.requiredStake,
            receiver,
            reasonHash
        );
        paymentToken.safeTransfer(covenant.creator, covenant.reward);
        emit CovenantSlashed(covenantId, receiver, covenant.requiredStake, covenant.reward, reasonHash);
    }

    function _executorOwner(uint256 executorAgentId) internal view returns (address) {
        return trustRegistry.ownerOf(executorAgentId);
    }

    function _executionWallet(uint256 executorAgentId) internal view returns (address) {
        ITrustRegistry.AgentState memory agent = trustRegistry.getAgentState(executorAgentId);
        return agent.executionWallet;
    }

    function _recoverSubmissionSigner(
        bytes32 covenantId,
        bytes32 taskHash,
        bytes32 proofHash,
        bytes32 receiptHead,
        bytes calldata operatorSignature
    ) internal view returns (address) {
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(SUBMIT_COMPLETION_TYPEHASH, covenantId, taskHash, proofHash, receiptHead))
        );
        return ECDSA.recover(digest, operatorSignature);
    }
}
