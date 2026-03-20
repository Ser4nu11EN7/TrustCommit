// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/Covenant.sol";
import "../contracts/TrustRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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
    bytes32 internal constant COVENANT_ROLE = keccak256("COVENANT_ROLE");
    bytes32 internal constant SUBMIT_COMPLETION_TYPEHASH =
        keccak256("SubmitCompletion(bytes32 covenantId,bytes32 taskHash,bytes32 proofHash,bytes32 receiptHead)");
    bytes32 internal constant ACCEPT_EXECUTION_ROLE_TYPEHASH =
        keccak256("AcceptExecutionRole(uint256 agentId,address newWallet,uint256 nonce)");
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
    uint256 internal executorOwnerPk = 0xA11CE;
    uint256 internal executionWalletPk = 0xB0B;
    uint256 internal rotatedExecutionWalletPk = 0xC0DE;
    address internal executorOwner;
    address internal executionWallet;
    address internal outsider = address(5);

    uint256 internal executorAgentId;

    function setUp() public {
        executorOwner = vm.addr(executorOwnerPk);
        executionWallet = vm.addr(executionWalletPk);

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
        registry.updateExecutionWallet(executorAgentId, executionWallet, _signExecutionWalletAcceptance(executorAgentId, executionWallet, executionWalletPk));
        vm.stopPrank();
    }

    function testCreateCovenantEscrowsRewardWithoutLockingStakeBeforeAcceptance() public {
        bytes32 covenantId = _proposeDefaultCovenant();

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

        assertEq(uint8(status), uint8(ICovenant.CovenantStatus.Pending));
        assertEq(storedCreator, creator);
        assertEq(storedExecutorAgentId, executorAgentId);
        assertEq(reward, DEFAULT_REWARD);
        assertEq(requiredStake, DEFAULT_STAKE);
        assertEq(taskHash, bytes32("task-1"));
        assertGt(deadline, block.timestamp);
        assertEq(paymentToken.balanceOf(address(covenant)), DEFAULT_REWARD);
        assertEq(registry.lockedTotal(executorAgentId), 0);
    }

    function testExecutionWalletMustAcceptBeforeStakeLocks() public {
        bytes32 covenantId = _proposeDefaultCovenant();

        vm.prank(executionWallet);
        covenant.acceptCovenant(covenantId);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Active));
        assertEq(registry.lockedTotal(executorAgentId), DEFAULT_STAKE);
    }

    function testSubmitAndFinalizeCompletionReleasesRewardWithAnchoredReceiptHead() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Submitted));
        assertEq(covenant.completionProof(covenantId), proofHash);
        assertEq(covenant.completionReceiptHead(covenantId), receiptHead);
        assertEq(covenant.completionSigner(covenantId), executionWallet);

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
        bytes32 receiptHead = keccak256("receipt-head");
        bytes32 evidenceHash = keccak256("evidence");
        bytes32 resultHash = keccak256("executor-wins");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);

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
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes32 evidenceHash = keccak256("bad-work");
        bytes32 resultHash = keccak256("creator-wins");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);

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

    function testTimeoutPendingCovenantRefundsWithoutSlashing() public {
        bytes32 covenantId = _proposeDefaultCovenant();

        vm.warp(block.timestamp + 2 days);

        uint256 creatorPaymentBefore = paymentToken.balanceOf(creator);
        uint256 creatorStakeBefore = stakeToken.balanceOf(creator);

        covenant.timeoutCovenant(covenantId);

        assertEq(uint8(_statusOf(covenantId)), uint8(ICovenant.CovenantStatus.Cancelled));
        assertEq(paymentToken.balanceOf(creator), creatorPaymentBefore + DEFAULT_REWARD);
        assertEq(stakeToken.balanceOf(creator), creatorStakeBefore);
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
        vm.expectRevert(Covenant.RewardTooLow.selector);
        covenant.createCovenant(
            executorAgentId,
            MIN_REWARD - 1,
            DEFAULT_STAKE,
            uint64(block.timestamp + 1 days),
            bytes32("task-1")
        );
        vm.stopPrank();
    }

    function testOnlyExecutionWalletCanAcceptCovenant() public {
        bytes32 covenantId = _proposeDefaultCovenant();

        vm.prank(executorOwner);
        vm.expectRevert(Covenant.OnlyExecutionWallet.selector);
        covenant.acceptCovenant(covenantId);
    }

    function testCannotSubmitCompletionBeforeAcceptance() public {
        bytes32 covenantId = _proposeDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        vm.expectRevert(Covenant.InvalidStatus.selector);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);
    }

    function testSubmitCompletionRequiresExecutionWalletAttestation() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory invalidSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executorOwnerPk);

        vm.prank(outsider);
        vm.expectRevert(Covenant.InvalidOperatorAttestation.selector);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, invalidSignature);
    }

    function testExecutionWalletRotationInvalidatesOldSignature() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory oldSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);
        address rotatedWallet = vm.addr(rotatedExecutionWalletPk);
        bytes memory rotationProof =
            _signExecutionWalletAcceptance(executorAgentId, rotatedWallet, rotatedExecutionWalletPk);

        vm.prank(executorOwner);
        registry.updateExecutionWallet(
            executorAgentId,
            rotatedWallet,
            rotationProof
        );

        vm.prank(outsider);
        vm.expectRevert(Covenant.InvalidOperatorAttestation.selector);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, oldSignature);

        bytes memory rotatedSignature =
            _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, rotatedExecutionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, rotatedSignature);

        assertEq(covenant.completionSigner(covenantId), rotatedWallet);
    }

    function testExecutionWalletRotationRequiresNewWalletConsent() public {
        vm.prank(executorOwner);
        vm.expectRevert();
        registry.updateExecutionWallet(executorAgentId, vm.addr(rotatedExecutionWalletPk), "");
    }

    function testCannotReuseProofHashAcrossCovenants() public {
        bytes32 firstCovenantId = _createDefaultCovenant();
        bytes32 secondCovenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("shared-proof");
        bytes32 firstReceiptHead = keccak256("receipt-head-1");
        bytes32 secondReceiptHead = keccak256("receipt-head-2");

        vm.prank(outsider);
        covenant.submitCompletion(
            firstCovenantId,
            proofHash,
            firstReceiptHead,
            _signCompletion(firstCovenantId, bytes32("task-1"), proofHash, firstReceiptHead, executionWalletPk)
        );

        vm.prank(outsider);
        vm.expectRevert(Covenant.ProofAlreadyCommitted.selector);
        covenant.submitCompletion(
            secondCovenantId,
            proofHash,
            secondReceiptHead,
            _signCompletion(secondCovenantId, bytes32("task-1"), proofHash, secondReceiptHead, executionWalletPk)
        );
    }

    function testFinalizeRequiresAnchoredReceiptHead() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes memory invalidSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, bytes32(0), executionWalletPk);

        vm.prank(outsider);
        vm.expectRevert(Covenant.InvalidReceiptHead.selector);
        covenant.submitCompletion(covenantId, proofHash, bytes32(0), invalidSignature);
    }

    function testOnlyArbiterCanResolveDispute() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);

        vm.prank(creator);
        covenant.disputeCovenant(covenantId, keccak256("evidence"));

        vm.prank(outsider);
        vm.expectRevert();
        covenant.resolveDispute(covenantId, false, keccak256("result"));
    }

    function testCannotDisputeAfterWindowCloses() public {
        bytes32 covenantId = _createDefaultCovenant();
        bytes32 proofHash = keccak256("proof");
        bytes32 receiptHead = keccak256("receipt-head");
        bytes memory operatorSignature = _signCompletion(covenantId, bytes32("task-1"), proofHash, receiptHead, executionWalletPk);

        vm.prank(outsider);
        covenant.submitCompletion(covenantId, proofHash, receiptHead, operatorSignature);

        vm.warp(block.timestamp + 7 days);

        vm.prank(creator);
        vm.expectRevert(Covenant.DisputeWindowClosed.selector);
        covenant.disputeCovenant(covenantId, keccak256("evidence"));
    }

    function testCannotDisputeBeforeSubmission() public {
        bytes32 covenantId = _createDefaultCovenant();

        vm.prank(creator);
        vm.expectRevert(Covenant.NotSubmitted.selector);
        covenant.disputeCovenant(covenantId, keccak256("evidence"));
    }

    function _proposeDefaultCovenant() internal returns (bytes32 covenantId) {
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

    function _createDefaultCovenant() internal returns (bytes32 covenantId) {
        covenantId = _proposeDefaultCovenant();
        vm.prank(executionWallet);
        covenant.acceptCovenant(covenantId);
    }

    function _statusOf(bytes32 covenantId) internal view returns (ICovenant.CovenantStatus) {
        (ICovenant.CovenantStatus status,,,,,,,) = covenant.covenants(covenantId);
        return status;
    }

    function _signCompletion(
        bytes32 covenantId,
        bytes32 taskHash,
        bytes32 proofHash,
        bytes32 receiptHead,
        uint256 signerKey
    ) internal view returns (bytes memory signature) {
        bytes32 structHash =
            keccak256(abi.encode(SUBMIT_COMPLETION_TYPEHASH, covenantId, taskHash, proofHash, receiptHead));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TrustCommitCovenant")),
                keccak256(bytes("1")),
                block.chainid,
                address(covenant)
            )
        );
    }

    function _signExecutionWalletAcceptance(
        uint256 agentId,
        address newWallet,
        uint256 signerKey
    ) internal view returns (bytes memory signature) {
        bytes32 structHash =
            keccak256(abi.encode(ACCEPT_EXECUTION_ROLE_TYPEHASH, agentId, newWallet, registry.executionWalletNonce(agentId)));
        bytes32 digest = MessageHashUtils.toTypedDataHash(_registryDomainSeparator(), structHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _registryDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TrustCommitRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(registry)
            )
        );
    }
}
