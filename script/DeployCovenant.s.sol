// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/Covenant.sol";
import "../contracts/TrustRegistry.sol";

contract DeployCovenant is Script {
    bytes32 internal constant COVENANT_ROLE = keccak256("COVENANT_ROLE");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address trustRegistryAddress = vm.envAddress("TRUST_REGISTRY_ADDRESS");
        address paymentToken = vm.envAddress("PAYMENT_TOKEN_ADDRESS");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        uint128 minReward = uint128(vm.envUint("MIN_REWARD"));

        vm.startBroadcast(deployerPrivateKey);

        Covenant covenant = new Covenant(trustRegistryAddress, paymentToken, arbiter, minReward);
        TrustRegistry(trustRegistryAddress).grantRole(COVENANT_ROLE, address(covenant));

        console.log("Covenant deployed at:", address(covenant));
        console.log("Granted COVENANT_ROLE on TrustRegistry");

        vm.stopBroadcast();
    }
}
