// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title XPassToken
 * @dev KIP-7 compliant token contract with all major optional extension features
 *
 * This contract provides the following features:
 * 1. KIP-7 required functions (name, symbol, totalSupply, balanceOf, transfer, approve, allowance, transferFrom)
 * 2. Token pause and resume (pause, unpause) - Owner only
 * 3. Signature-based delegation (permit)
 * 4. Owner-based access control (Ownable) - Multi-sig ready
 * 5. Fixed supply (no additional minting or burning)
 */
contract XPassToken is ERC20, ERC20Pausable, Ownable, ERC20Permit {

    // Token decimal places
    uint8 private constant DECIMALS = 18;
    
    // Maximum supply (1,000,000,000 tokens)
    uint256 private constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    
    // Custom events
    event TokensPaused();
    event TokensUnpaused();
    
    /**
     * @dev Contract constructor
     * @param initialOwner Initial token owner address (can be Safe multi-sig address)
     */
    constructor(address initialOwner)
        ERC20("XPASS Token", "XPASS")
        Ownable(initialOwner)
        ERC20Permit("XPASS Token")
    {
        // Mint maximum supply to owner when contract is deployed
        _mint(initialOwner, MAX_SUPPLY);
    }
    
    /**
     * @dev Pause token transfer function (Owner only)
     * When using Kaia Safe, this requires multi-sig approval
     */
    function pause() public onlyOwner {
        _pause();
        emit TokensPaused();
    }
    
    /**
     * @dev Resume token transfer function (Owner only)
     * When using Kaia Safe, this requires multi-sig approval
     */
    function unpause() public onlyOwner {
        _unpause();
        emit TokensUnpaused();
    }
        
    /**
     * @dev Internal function override to check pause status before token transfer
     */
    function _update(address from, address to, uint256 amount)
        internal
        override(ERC20, ERC20Pausable)
    {
        // Token transfer is not allowed when paused
        if (paused()) {
            revert("ERC20Pausable: token transfer while paused");
        }
        super._update(from, to, amount);
    }
    
    /**
     * @dev Version function used by ERC20Permit
     */
    function version() public pure returns (string memory) {
        return "1";
    }
    
    /**
     * @dev Function to return maximum supply
     */
    function maxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }
}