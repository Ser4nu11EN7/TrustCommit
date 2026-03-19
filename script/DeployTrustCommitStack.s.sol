// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/Covenant.sol";
import "../contracts/TrustRegistry.sol";
import "../contracts/mocks/MockERC20.sol";

contract DeployTrustCommitStack is Script {
    bytes32 internal constant COVENANT_ROLE = keccak256("COVENANT_ROLE");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        uint128 minReward = uint128(vm.envUint("MIN_REWARD"));

        address configuredStakeToken = vm.envOr("STAKE_TOKEN_ADDRESS", address(0));
        address configuredPaymentToken = vm.envOr("PAYMENT_TOKEN_ADDRESS", address(0));

        vm.startBroadcast(deployerPrivateKey);

        address stakeToken = configuredStakeToken;
        address paymentToken = configuredPaymentToken;

        if (stakeToken == address(0) && paymentToken == address(0)) {
            string memory name = vm.envOr("MOCK_TOKEN_NAME", string("Mock USDC"));
            string memory symbol = vm.envOr("MOCK_TOKEN_SYMBOL", string("mUSDC"));
            uint8 decimals = uint8(vm.envOr("MOCK_TOKEN_DECIMALS", uint256(6)));
            uint256 initialSupply = vm.envOr("MOCK_TOKEN_INITIAL_SUPPLY", uint256(1_000_000_000_000));
            address recipient = vm.envOr("MOCK_TOKEN_RECIPIENT", deployer);

            MockERC20 token = new MockERC20(name, symbol, decimals, recipient, initialSupply);
            stakeToken = address(token);
            paymentToken = address(token);

            console.log("Deployed shared mock token:", address(token));
        } else {
            if (stakeToken == address(0)) {
                stakeToken = paymentToken;
            }
            if (paymentToken == address(0)) {
                paymentToken = stakeToken;
            }
        }

        TrustRegistry registry = new TrustRegistry(stakeToken);
        Covenant covenant = new Covenant(address(registry), paymentToken, arbiter, minReward);
        registry.grantRole(COVENANT_ROLE, address(covenant));

        console.log("Stake token:", stakeToken);
        console.log("Payment token:", paymentToken);
        console.log("TrustRegistry:", address(registry));
        console.log("Covenant:", address(covenant));
        console.log("Arbiter:", arbiter);
        console.log("Min reward:", uint256(minReward));

        vm.stopBroadcast();
    }
}
