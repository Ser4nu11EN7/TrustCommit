// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICovenant.sol";
import "./interfaces/ITrustRegistry.sol";

contract Covenant is AccessControl, Pausable, ReentrancyGuard, ICovenant {
    using SafeERC20 for IERC20;

    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    uint64 public constant DISPUTE_WINDOW = 7 days;
    bytes32 private constant TIMEOUT_REASON_HASH = keccak256("TIMEOUT");

    IERC20 public immutable paymentToken;
    ITrustRegistry public immutable trustRegistry;
    uint128 public immutable minReward;

    uint256 private _nextNonce;

    mapping(bytes32 => CovenantState) public covenants;
    mapping(bytes32 => uint64) public completionSubmittedAt;
    mapping(bytes32 => bytes32) public completionProof;
    mapping(bytes32 => bytes32) public disputeEvidence;
    mapping(bytes32 => bytes32) public resolutionHash;
    mapping(bytes32 => mapping(address => bool)) public cancelApprovals;

    constructor(address _trustRegistry, address _paymentToken, address _initialArbiter, uint128 _minReward) {
        require(_trustRegistry != address(0), "Invalid registry");
        require(_paymentToken != address(0), "Invalid token");
        require(_initialArbiter != address(0), "Invalid arbiter");

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
        require(reward >= minReward, "Reward too low");
        require(requiredStake > 0, "Stake must be > 0");
        require(deadline > block.timestamp, "Invalid deadline");
        require(taskHash != bytes32(0), "Invalid task hash");

        ITrustRegistry.AgentState memory agent = trustRegistry.getAgentState(executorAgentId);
        require(agent.status == ITrustRegistry.AgentStatus.Active, "Agent not active");

        uint128 availableStake = trustRegistry.stakeBalance(executorAgentId) - trustRegistry.lockedTotal(executorAgentId);
        require(availableStake >= requiredStake, "Insufficient free stake");

        uint256 nonce = _nextNonce++;
        covenantId = keccak256(abi.encode(msg.sender, executorAgentId, nonce));

        covenants[covenantId] = CovenantState({
            status: CovenantStatus.Active,
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
        require(received == reward, "Unsupported payment token");

        trustRegistry.lockStake(executorAgentId, covenantId, requiredStake);

        emit CovenantCreated(covenantId, msg.sender, executorAgentId, reward, requiredStake, deadline, taskHash);
    }

    function submitCompletion(bytes32 covenantId, bytes32 proofHash) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        require(covenant.status == CovenantStatus.Active, "Invalid status");
        require(block.timestamp <= covenant.deadline, "Deadline passed");
        require(proofHash != bytes32(0), "Invalid proof hash");
        require(msg.sender == _executorOwner(covenant.executorAgentId), "Not executor");

        covenant.status = CovenantStatus.Submitted;
        completionSubmittedAt[covenantId] = uint64(block.timestamp);
        completionProof[covenantId] = proofHash;

        emit CompletionSubmitted(covenantId, proofHash, uint64(block.timestamp));
    }

    function finalizeCompletion(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        require(covenant.status == CovenantStatus.Submitted, "Not submitted");
        require(block.timestamp >= completionSubmittedAt[covenantId] + DISPUTE_WINDOW, "Dispute window active");

        _completeCovenant(covenantId, covenant);
    }

    function disputeCovenant(bytes32 covenantId, bytes32 evidenceHash) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        require(msg.sender == covenant.creator, "Only creator");
        require(evidenceHash != bytes32(0), "Invalid evidence hash");
        require(
            covenant.status == CovenantStatus.Active || covenant.status == CovenantStatus.Submitted,
            "Invalid status"
        );

        if (covenant.status == CovenantStatus.Submitted) {
            require(
                block.timestamp < completionSubmittedAt[covenantId] + DISPUTE_WINDOW,
                "Dispute window closed"
            );
        }

        covenant.status = CovenantStatus.Disputed;
        disputeEvidence[covenantId] = evidenceHash;

        emit CovenantDisputed(covenantId, evidenceHash);
    }

    function resolveDispute(bytes32 covenantId, bool executorWins, bytes32 _resolutionHash)
        external
        onlyRole(ARBITER_ROLE)
        nonReentrant
        whenNotPaused
    {
        CovenantState storage covenant = covenants[covenantId];
        require(covenant.status == CovenantStatus.Disputed, "Not disputed");
        require(_resolutionHash != bytes32(0), "Invalid resolution hash");

        resolutionHash[covenantId] = _resolutionHash;
        emit DisputeResolved(covenantId, executorWins, _resolutionHash);

        if (executorWins) {
            _completeCovenant(covenantId, covenant);
        } else {
            _slashCovenant(covenantId, covenant, covenant.creator, _resolutionHash);
        }
    }

    function timeoutCovenant(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        require(covenant.status == CovenantStatus.Active, "Invalid status");
        require(block.timestamp > covenant.deadline, "Not expired");

        _slashCovenant(covenantId, covenant, covenant.creator, TIMEOUT_REASON_HASH);
    }

    function cancelCovenant(bytes32 covenantId) external nonReentrant whenNotPaused {
        CovenantState storage covenant = covenants[covenantId];
        require(covenant.status == CovenantStatus.Active, "Invalid status");
        require(block.timestamp <= covenant.deadline, "Deadline passed");

        address executor = _executorOwner(covenant.executorAgentId);
        require(msg.sender == covenant.creator || msg.sender == executor, "Not authorized");
        require(!cancelApprovals[covenantId][msg.sender], "Approval already given");

        cancelApprovals[covenantId][msg.sender] = true;
        emit CancelApprovalGiven(covenantId, msg.sender);

        if (cancelApprovals[covenantId][covenant.creator] && cancelApprovals[covenantId][executor]) {
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
}
