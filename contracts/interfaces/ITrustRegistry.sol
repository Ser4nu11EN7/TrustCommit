// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITrustRegistry {
    enum AgentStatus { None, Active, Suspended }

    struct AgentState {
        AgentStatus status;
        address executionWallet;
        uint64 createdAt;
        uint64 updatedAt;
        uint16 scoreBps;
        uint32 slashCount;
        bytes32 profileHash;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed owner, bytes32 profileHash);
    event StakeDeposited(uint256 indexed agentId, uint128 amount, uint128 newBalance);
    event StakeWithdrawn(uint256 indexed agentId, uint128 amount, uint128 newBalance);
    event StakeLocked(uint256 indexed agentId, bytes32 indexed covenantId, uint128 amount);
    event StakeUnlocked(uint256 indexed agentId, bytes32 indexed covenantId, uint128 amount);
    event StakeSlashed(uint256 indexed agentId, bytes32 indexed covenantId, uint128 amount, address receiver, bytes32 reasonHash);
    event ReputationUpdated(uint256 indexed agentId, uint16 newScoreBps, bytes32 evidenceRoot);
    event ExecutionWalletUpdated(uint256 indexed agentId, address oldWallet, address newWallet);

    function registerAgent(address to, string calldata agentURI, bytes32 profileHash) external returns (uint256);
    function stake(uint256 agentId, uint128 amount) external;
    function withdrawStake(uint256 agentId, uint128 amount) external;
    function lockStake(uint256 agentId, bytes32 covenantId, uint128 amount) external;
    function unlockStake(uint256 agentId, bytes32 covenantId) external;
    function slash(uint256 agentId, bytes32 covenantId, uint128 amount, address receiver, bytes32 reasonHash) external;
    function commitReputation(uint256 agentId, uint16 newScoreBps, bytes32 evidenceRoot) external;
    function updateExecutionWallet(uint256 agentId, address newWallet, bytes calldata proof) external;

    function getAgentState(uint256 agentId) external view returns (AgentState memory);
    function stakeBalance(uint256 agentId) external view returns (uint128);
    function lockedTotal(uint256 agentId) external view returns (uint128);
    function executionWalletNonce(uint256 agentId) external view returns (uint256);
    function ownerOf(uint256 agentId) external view returns (address);
}
