// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ITrustRegistry.sol";

contract TrustRegistry is ERC721URIStorage, AccessControl, ReentrancyGuard, Pausable, ITrustRegistry {
    using SafeERC20 for IERC20;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant COVENANT_ROLE = keccak256("COVENANT_ROLE");

    IERC20 public immutable stakeToken;
    uint256 private _nextAgentId = 1;

    mapping(uint256 => AgentState) public agents;
    mapping(uint256 => uint128) public stakeBalance;
    mapping(uint256 => uint128) public lockedTotal;
    mapping(uint256 => mapping(bytes32 => uint128)) public locks;

    constructor(address _stakeToken) ERC721("TrustCommit Agent", "TCAGENT") {
        require(_stakeToken != address(0), "Invalid token");
        stakeToken = IERC20(_stakeToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function registerAgent(address to, string calldata agentURI, bytes32 profileHash)
        external
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        require(to != address(0), "Invalid address");
        require(to == msg.sender, "Recipient must self-register");
        uint256 agentId = _nextAgentId++;

        agents[agentId] = AgentState({
            status: AgentStatus.Active,
            executionWallet: to,
            createdAt: uint64(block.timestamp),
            updatedAt: uint64(block.timestamp),
            scoreBps: 5000,
            slashCount: 0,
            profileHash: profileHash
        });

        _safeMint(to, agentId);
        _setTokenURI(agentId, agentURI);

        emit AgentRegistered(agentId, to, profileHash);
        return agentId;
    }

    function stake(uint256 agentId, uint128 amount) external nonReentrant whenNotPaused {
        require(agents[agentId].status == AgentStatus.Active, "Agent not active");
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(amount > 0, "Amount must be > 0");

        uint256 balanceBefore = stakeToken.balanceOf(address(this));
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakeToken.balanceOf(address(this)) - balanceBefore;
        require(received == amount, "Unsupported stake token");

        stakeBalance[agentId] += amount;

        emit StakeDeposited(agentId, amount, stakeBalance[agentId]);
    }

    function withdrawStake(uint256 agentId, uint128 amount) external nonReentrant whenNotPaused {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(amount > 0, "Amount must be > 0");

        uint128 available = stakeBalance[agentId] - lockedTotal[agentId];
        require(available >= amount, "Insufficient free stake");

        stakeBalance[agentId] -= amount;
        stakeToken.safeTransfer(msg.sender, amount);

        emit StakeWithdrawn(agentId, amount, stakeBalance[agentId]);
    }

    function lockStake(uint256 agentId, bytes32 covenantId, uint128 amount)
        external
        onlyRole(COVENANT_ROLE)
        whenNotPaused
    {
        require(agents[agentId].status == AgentStatus.Active, "Agent not active");
        require(locks[agentId][covenantId] == 0, "Already locked");
        require(amount > 0, "Amount must be > 0");

        uint128 available = stakeBalance[agentId] - lockedTotal[agentId];
        require(available >= amount, "Insufficient free stake");

        locks[agentId][covenantId] = amount;
        lockedTotal[agentId] += amount;

        emit StakeLocked(agentId, covenantId, amount);
    }

    function unlockStake(uint256 agentId, bytes32 covenantId)
        external
        onlyRole(COVENANT_ROLE)
        whenNotPaused
    {
        uint128 amount = locks[agentId][covenantId];
        require(amount > 0, "No lock found");

        delete locks[agentId][covenantId];
        lockedTotal[agentId] -= amount;

        emit StakeUnlocked(agentId, covenantId, amount);
    }

    function slash(
        uint256 agentId,
        bytes32 covenantId,
        uint128 amount,
        address receiver,
        bytes32
    ) external onlyRole(COVENANT_ROLE) nonReentrant whenNotPaused {
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Amount must be > 0");
        uint128 locked = locks[agentId][covenantId];
        require(locked >= amount, "Insufficient locked stake");

        uint128 remaining = locked - amount;
        if (remaining == 0) {
            delete locks[agentId][covenantId];
        } else {
            locks[agentId][covenantId] = remaining;
        }
        lockedTotal[agentId] -= amount;
        stakeBalance[agentId] -= amount;

        agents[agentId].slashCount++;
        agents[agentId].updatedAt = uint64(block.timestamp);

        stakeToken.safeTransfer(receiver, amount);

        emit StakeSlashed(agentId, covenantId, amount, receiver);
    }

    function commitReputation(uint256 agentId, uint16 newScoreBps, bytes32 evidenceRoot)
        external
        onlyRole(ORACLE_ROLE)
        whenNotPaused
    {
        require(agents[agentId].status != AgentStatus.None, "Agent not found");
        require(newScoreBps <= 10000, "Score exceeds max");

        agents[agentId].scoreBps = newScoreBps;
        agents[agentId].updatedAt = uint64(block.timestamp);

        emit ReputationUpdated(agentId, newScoreBps, evidenceRoot);
    }

    function updateExecutionWallet(uint256 agentId, address newWallet, bytes calldata)
        external
        whenNotPaused
    {
        require(ownerOf(agentId) == msg.sender, "Not owner");
        require(newWallet != address(0), "Invalid address");

        address oldWallet = agents[agentId].executionWallet;
        agents[agentId].executionWallet = newWallet;
        agents[agentId].updatedAt = uint64(block.timestamp);

        emit ExecutionWalletUpdated(agentId, oldWallet, newWallet);
    }

    function getAgentState(uint256 agentId) external view returns (AgentState memory) {
        return agents[agentId];
    }

    function ownerOf(uint256 agentId)
        public
        view
        override(ERC721, IERC721, ITrustRegistry)
        returns (address)
    {
        return super.ownerOf(agentId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
