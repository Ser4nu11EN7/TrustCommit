// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/TrustRegistry.sol";

contract DeployTrustRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address stakeToken = vm.envAddress("STAKE_TOKEN_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        TrustRegistry registry = new TrustRegistry(stakeToken);

        console.log("TrustRegistry deployed at:", address(registry));

        vm.stopBroadcast();
    }
}
