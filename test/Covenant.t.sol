// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/Covenant.sol";
import "../contracts/TrustRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20Decimals is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(string memory name_, string memory symbol_, uint8 tokenDecimals_) ERC20(name_, symbol_) {
        _tokenDecimals = tokenDecimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract CovenantTest is Test {
    bytes32 internal constant ARBITER_ROLE = keccak256("ARBITER_ROLE");
    bytes32 internal constant COVENANT_ROLE = keccak256("COVENANT_ROLE");
    uint128 internal constant MIN_REWARD = 1e6;
    uint128 internal constant DEFAULT_REWARD = 10e6;
    uint128 internal constant DEFAULT_STAKE = 500e18;

    TrustRegistry internal registry;
    Covenant internal covenant;
    MockERC20Decimals internal stakeToken;
    MockERC20Decimals internal paymentToken;

    address internal admin = address(1);
    address internal arbiter = address(2);
    address internal creator = address(3);
    address internal executorOwner = address(4);
    address internal outsider = address(5);

    uint256 internal executorAgentId;

    function setUp() public {
        vm.startPrank(admin);
        stakeToken = new MockERC20Decimals("Stake Token", "STK", 18);
        paymentToken = new MockERC20Decimals("Mock USDC", "mUSDC", 6);

        registry = new TrustRegistry(address(stakeToken));
        covenant = new Covenant(address(registry), address(paymentToken), arbiter, MIN_REWARD);

        registry.grantRole(COVENANT_ROLE, address(covenant));
        vm.stopPrank();

        stakeToken.mint(executorOwner, 2_000e18);
        paymentToken.mint(creator, 1_000e6);
        paymentToken.mint(outsider, 1_000e6);

        vm.startPrank(executorOwner);
        executorAgentId = registry.registerAgent(executorOwner, "ipfs://executor", bytes32("executor-profile"));
        stakeToken.approve(address(registry), type(uint256).max);
        registry.stake(executorAgentId, 1_000e18);
        vm.stopPrank();
    }

    function testCreateCovenantEscrowsRewardAndLocksStake() public {
        bytes32 covenantId = _createDefaultCovenant();

        (
            ICovenant.CovenantStatus status,
            address storedCreator,
            uint256 storedExecutorAgentId,
            uint128 reward,
            uint128 requiredStake,
            ,
            uint64 deadline,
            bytes32 taskHash
        ) = covenant.covenants(covenantId);

        assertEq(uint8(status), uint8(ICovenant.CovenantStatus.Active));
        assertEq(storedCreator, creator);
        assertEq(storedExecutorAgentId, executorAgentId);
        assertEq(reward, DEFAULT_REWARD);
        assertEq(requiredStake, DEFAULT_STAKE);
        assertEq(taskHash, bytes32("task-1"));
        assertGt(deadline, block.timestamp);
        assertEq(paymentToken.balanceOf(address(covenant)), DEFAULT_REWARD);
        assertEq(registry.lockedTotal(executorAgentId), DEFAULT_STAKE);
    }

    function testSubmitAndFinalizeCompletionReleasesReward() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");

        vm.prank(executorOwner);
        covenant.submitCompletion(covenantId, proofHash);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Submitted));
        assertEq(covenant.completionProof(covenantId), proofHash);

        vm.warp(block.timestamp + 7 days);

        uint256 executorBalanceBefore = paymentToken.balanceOf(executorOwner);
        covenant.finalizeCompletion(covenantId);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Completed));
        assertEq(paymentToken.balanceOf(executorOwner), executorBalanceBefore + DEFAULT_REWARD);
        assertEq(paymentToken.balanceOf(address(covenant)), 0);
        assertEq(registry.lockedTotal(executorAgentId), 0);
    }

    function testCreatorCanDisputeAndArbiterCanResolveForExecutor() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 resultHash = keccak256("executor-wins");

        vm.prank(executorOwner);
        covenant.submitCompletion(covenantId, proofHash);

        vm.prank(creator);
        covenant.disputeCovenant(covenantId, evidenceHash);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Disputed));
        assertEq(covenant.disputeEvidence(covenantId), evidenceHash);

        uint256 executorBalanceBefore = paymentToken.balanceOf(executorOwner);

        vm.prank(arbiter);
        covenant.resolveDispute(covenantId, true, resultHash);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Completed));
        assertEq(covenant.resolutionHash(covenantId), resultHash);
        assertEq(paymentToken.balanceOf(executorOwner), executorBalanceBefore + DEFAULT_REWARD);
        assertEq(registry.lockedTotal(executorAgentId), 0);
    }

    function testCreatorWinDisputeRefundsRewardAndSlashesStake() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 evidenceHash = keccak256("bad-work");
        bytes32 resultHash = keccak256("creator-wins");

        vm.prank(creator);
        covenant.disputeCovenant(covenantId, evidenceHash);

        uint256 creatorPaymentBefore = paymentToken.balanceOf(creator);
        uint256 creatorStakeBefore = stakeToken.balanceOf(creator);

        vm.prank(arbiter);
        covenant.resolveDispute(covenantId, false, resultHash);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Slashed));
        assertEq(covenant.resolutionHash(covenantId), resultHash);
        assertEq(paymentToken.balanceOf(creator), creatorPaymentBefore + DEFAULT_REWARD);
        assertEq(stakeToken.balanceOf(creator), creatorStakeBefore + DEFAULT_STAKE);
        assertEq(registry.lockedTotal(executorAgentId), 0);
        assertEq(registry.stakeBalance(executorAgentId), 1_000e18 - DEFAULT_STAKE);
    }

    function testTimeoutSlashesActiveCovenant() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.warp(block.timestamp + 2 days);

        uint256 creatorPaymentBefore = paymentToken.balanceOf(creator);
        uint256 creatorStakeBefore = stakeToken.balanceOf(creator);

        covenant.timeoutCovenant(covenantId);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Slashed));
        assertEq(paymentToken.balanceOf(creator), creatorPaymentBefore + DEFAULT_REWARD);
        assertEq(stakeToken.balanceOf(creator), creatorStakeBefore + DEFAULT_STAKE);
        assertEq(registry.lockedTotal(executorAgentId), 0);
    }

    function testCancelRequiresBothParties() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.prank(creator);
        covenant.cancelCovenant(covenantId);

        assertTrue(covenant.cancelApprovals(covenantId, creator));
        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Active));

        uint256 creatorBalanceBefore = paymentToken.balanceOf(creator);

        vm.prank(executorOwner);
        covenant.cancelCovenant(covenantId);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Cancelled));
        assertEq(paymentToken.balanceOf(creator), creatorBalanceBefore + DEFAULT_REWARD);
        assertEq(registry.lockedTotal(executorAgentId), 0);
    }

    function testCannotCreateBelowMinimumReward() public {
        vm.startPrank(creator);
        paymentToken.approve(address(covenant), type(uint256).max);
        vm.expectRevert("Reward too low");
        covenant.createCovenant(
            executorAgentId,
            MIN_REWARD - 1,
            DEFAULT_STAKE,
            uint64(block.timestamp + 1 days),
            bytes32("task-1")
        );
        vm.stopPrank();
    }

    function testOnlyExecutorOwnerCanSubmitCompletion() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.prank(outsider);
        vm.expectRevert("Not executor");
        covenant.submitCompletion(covenantId, keccak256("proof"));
    }

    function testOnlyArbiterCanResolveDispute() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.prank(creator);
        covenant.disputeCovenant(covenantId, keccak256("evidence"));

        vm.prank(outsider);
        vm.expectRevert();
        covenant.resolveDispute(covenantId, false, keccak256("result"));
    }

    function testCannotDisputeAfterWindowCloses() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.prank(executorOwner);
        covenant.submitCompletion(covenantId, keccak256("proof"));

        vm.warp(block.timestamp + 7 days);

        vm.prank(creator);
        vm.expectRevert("Dispute window closed");
        covenant.disputeCovenant(covenantId, keccak256("evidence"));
    }

    function _createDefaultCovenant() internal returns (bytes32 covenantId) {
        vm.startPrank(creator);
        paymentToken.approve(address(covenant), type(uint256).max);
        covenantId = covenant.createCovenant(
            executorAgentId,
            DEFAULT_REWARD,
            DEFAULT_STAKE,
            uint64(block.timestamp + 1 days),
            bytes32("task-1")
        );
        vm.stopPrank();
    }

    function _statusOf(bytes32 covenantId) internal view returns (ICovenant.CovenantStatus) {
        (ICovenant.CovenantStatus status,,,,,,,) = covenant.covenants(covenantId);
        return status;
    }
}
