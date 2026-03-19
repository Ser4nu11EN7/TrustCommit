// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/mocks/MockERC20.sol";

contract DeployMockERC20 is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        string memory name = vm.envString("MOCK_TOKEN_NAME");
        string memory symbol = vm.envString("MOCK_TOKEN_SYMBOL");
        uint8 decimals = uint8(vm.envUint("MOCK_TOKEN_DECIMALS"));
        address initialRecipient = vm.envAddress("MOCK_TOKEN_RECIPIENT");
        uint256 initialSupply = vm.envUint("MOCK_TOKEN_INITIAL_SUPPLY");

        vm.startBroadcast(deployerPrivateKey);

        MockERC20 token = new MockERC20(name, symbol, decimals, initialRecipient, initialSupply);

        console.log("MockERC20 deployed at:", address(token));

        vm.stopBroadcast();
    }
}
