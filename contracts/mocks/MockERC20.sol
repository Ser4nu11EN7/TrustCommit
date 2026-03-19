// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _tokenDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialRecipient,
        uint256 initialSupply
    ) ERC20(name_, symbol_) {
        require(initialRecipient != address(0), "Invalid recipient");
        _tokenDecimals = decimals_;
        _mint(initialRecipient, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
