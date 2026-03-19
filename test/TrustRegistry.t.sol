// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/TrustRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MOCK") {
        _mint(msg.sender, 1000000 * 10**18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TrustRegistryTest is Test {
    TrustRegistry public registry;
    MockERC20 public token;

    address public owner = address(1);
    address public oracle = address(2);
    address public covenant = address(3);
    address public user1 = address(4);
    address public user2 = address(5);

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant COVENANT_ROLE = keccak256("COVENANT_ROLE");

    function setUp() public {
        vm.startPrank(owner);
        token = new MockERC20();
        registry = new TrustRegistry(address(token));

        registry.grantRole(ORACLE_ROLE, oracle);
        registry.grantRole(COVENANT_ROLE, covenant);

        token.mint(user1, 10000 * 10**18);
        token.mint(user2, 10000 * 10**18);
        vm.stopPrank();
    }

    function testRegisterAgent() public {
        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        assertEq(agentId, 1);
        assertEq(registry.ownerOf(agentId), user1);

        ITrustRegistry.AgentState memory state = registry.getAgentState(agentId);
        assertEq(uint8(state.status), uint8(ITrustRegistry.AgentStatus.Active));
        assertEq(state.executionWallet, user1);
        assertEq(state.scoreBps, 5000);
    }

    function testStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);

        assertEq(registry.stakeBalance(agentId), stakeAmount);
        vm.stopPrank();
    }

    function testCannotStakeForAgentYouDoNotOwn() public {
        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        vm.startPrank(user2);
        token.approve(address(registry), 100 * 10**18);
        vm.expectRevert("Not owner");
        registry.stake(agentId, 100 * 10**18);
        vm.stopPrank();
    }

    function testWithdrawStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);

        uint128 withdrawAmount = 500 * 10**18;
        registry.withdrawStake(agentId, withdrawAmount);

        assertEq(registry.stakeBalance(agentId), stakeAmount - withdrawAmount);
        vm.stopPrank();
    }

    function testCannotWithdrawLockedStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        bytes32 covenantId = bytes32("covenant1");
        vm.prank(covenant);
        registry.lockStake(agentId, covenantId, stakeAmount);

        vm.prank(user1);
        vm.expectRevert("Insufficient free stake");
        registry.withdrawStake(agentId, 1);
    }

    function testLockStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        bytes32 covenantId = bytes32("covenant1");
        vm.prank(covenant);
        registry.lockStake(agentId, covenantId, 500 * 10**18);

        assertEq(registry.lockedTotal(agentId), 500 * 10**18);
    }

    function testCannotLockZeroStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        vm.prank(covenant);
        vm.expectRevert("Amount must be > 0");
        registry.lockStake(agentId, bytes32("covenant1"), 0);
    }

    function testUnlockStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        bytes32 covenantId = bytes32("covenant1");
        vm.startPrank(covenant);
        registry.lockStake(agentId, covenantId, 500 * 10**18);
        registry.unlockStake(agentId, covenantId);
        vm.stopPrank();

        assertEq(registry.lockedTotal(agentId), 0);
    }

    function testSlash() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        bytes32 covenantId = bytes32("covenant1");
        uint128 lockAmount = 500 * 10**18;
        uint128 slashAmount = 200 * 10**18;

        vm.startPrank(covenant);
        registry.lockStake(agentId, covenantId, lockAmount);

        uint256 receiverBalanceBefore = token.balanceOf(user2);
        registry.slash(agentId, covenantId, slashAmount, user2, bytes32("violation"));
        vm.stopPrank();

        assertEq(registry.stakeBalance(agentId), stakeAmount - slashAmount);
        assertEq(token.balanceOf(user2), receiverBalanceBefore + slashAmount);
    }

    function testCannotSlashZeroStake() public {
        vm.startPrank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        uint128 stakeAmount = 1000 * 10**18;
        token.approve(address(registry), stakeAmount);
        registry.stake(agentId, stakeAmount);
        vm.stopPrank();

        vm.prank(covenant);
        registry.lockStake(agentId, bytes32("covenant1"), 500 * 10**18);

        vm.prank(covenant);
        vm.expectRevert("Amount must be > 0");
        registry.slash(agentId, bytes32("covenant1"), 0, user2, bytes32("violation"));
    }

    function testCommitReputation() public {
        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        vm.prank(oracle);
        registry.commitReputation(agentId, 7500, bytes32("evidence"));

        ITrustRegistry.AgentState memory state = registry.getAgentState(agentId);
        assertEq(state.scoreBps, 7500);
    }

    function testCannotCommitReputationWithoutRole() public {
        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        vm.prank(user2);
        vm.expectRevert();
        registry.commitReputation(agentId, 7500, bytes32("evidence"));
    }

    function testCannotLockStakeWithoutRole() public {
        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        vm.prank(user2);
        vm.expectRevert();
        registry.lockStake(agentId, bytes32("covenant1"), 100);
    }

    function testPauseUnpause() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.registerAgent(user1, "ipfs://test", bytes32("profile"));

        vm.prank(owner);
        registry.unpause();

        vm.prank(user1);
        uint256 agentId = registry.registerAgent(user1, "ipfs://test", bytes32("profile"));
        assertEq(agentId, 1);
    }
}
