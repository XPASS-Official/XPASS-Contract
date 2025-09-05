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
    // NOTE: This constant is currently unused - OpenZeppelin's ERC20 contract uses default value of 18
    // If you need to override the default decimals, implement the decimals() function to return this value
    // uint8 private constant DECIMALS = 18;
    
    // Maximum supply (1,000,000,000 tokens)
    uint256 private constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    
    // Custom events
    event TokensPaused();
    event TokensUnpaused();
    event TimelockControllerChanged(address indexed oldTimelockController, address indexed newTimelockController);
    
    // State variable to hold the address of the TimelockController contract
    address public timelockController;
    
    /**
     * @dev Modifier to restrict function calls to only the TimelockController address.
     */
    modifier onlyTimelock() {
        require(msg.sender == timelockController, "XPassToken: caller is not the timelock controller");
        _;
    }
    
    /**
     * @dev Contract constructor
     * @param initialOwner Initial token owner address (can be Safe multi-sig address)
     * @param _timelockController The address of the deployed XPassTimelockController.
     */
    constructor(address initialOwner, address _timelockController)
        ERC20("XPASS Token", "XPASS")
        Ownable(initialOwner)
        ERC20Permit("XPASS Token")
    {
        require(_timelockController != address(0), "Timelock address must be valid");
        timelockController = _timelockController;

        // Mint maximum supply to owner when contract is deployed
        _mint(initialOwner, MAX_SUPPLY);
    }
    
    /**
     * @dev Pause token transfer function (TimelockController only)
     * When using Kaia Safe, this requires a proposal and a time-locked execution.
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     */
    function pause() public onlyTimelock {
        require(timelockController != address(0), "XPassToken: TimelockController has been removed");
        _pause();
        emit TokensPaused();
    }
    
    /**
     * @dev Resume token transfer function (TimelockController only)
     * When using Kaia Safe, this requires a proposal and a time-locked execution.
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     */
    function unpause() public onlyTimelock {
        require(timelockController != address(0), "XPassToken: TimelockController has been removed");
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
        // NOTE: Removed redundant pause check - ERC20Pausable already handles this via whenNotPaused modifier
        // The original implementation had duplicate pause checking:
        // 1. Manual check: if (paused()) { revert("ERC20Pausable: token transfer while paused"); }
        // 2. ERC20Pausable's whenNotPaused modifier automatically checks pause status
        // This caused redundant gas consumption and unnecessary code complexity
        
        // Original redundant code (commented out):
        // if (paused()) {
        //     revert("ERC20Pausable: token transfer while paused");
        // }
        
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
    
    /**
     * @dev Changes the TimelockController address
     * @param newTimelockController New TimelockController address
     * @notice Only the owner can call this function
     * @notice This allows upgrading the TimelockController if needed
     */
    function changeTimelockController(address newTimelockController) external onlyOwner {
        require(newTimelockController != address(0), "XPassToken: new timelock controller cannot be zero address");
        require(newTimelockController != timelockController, "XPassToken: new timelock controller cannot be current timelock controller");
        
        address oldTimelockController = timelockController;
        timelockController = newTimelockController;
        
        emit TimelockControllerChanged(oldTimelockController, newTimelockController);
    }
    
    /**
     * @dev Internal function to remove the TimelockController (sets to zero address)
     * @notice This is only called internally during renounceOwnership when not paused
     */
    function _removeTimelockController() internal {
        address oldTimelockController = timelockController;
        timelockController = address(0);
        
        emit TimelockControllerChanged(oldTimelockController, address(0));
    }
    
    /**
     * @dev Get the current TimelockController address
     * @return Current TimelockController address
     */
    function getTimelockController() external view returns (address) {
        return timelockController;
    }
    
    /**
     * @dev Override renounceOwnership to prevent renouncement when paused
     * @notice This prevents ownership renouncement when token is paused to avoid permanent pause
     * @notice If not paused, TimelockController is automatically removed before renouncement
     */
    function renounceOwnership() public override onlyOwner {
        // Prevent renouncement when token is paused
        require(!paused(), "XPassToken: cannot renounce ownership while paused");
        
        // Remove TimelockController before renouncing ownership (only when not paused)
        if (timelockController != address(0)) {
            _removeTimelockController();
        }
        
        // Call parent renounceOwnership
        super.renounceOwnership();
    }
}