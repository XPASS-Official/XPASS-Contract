// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title XPassTokenBSC
 * @dev BEP20 compliant token contract for Binance Smart Chain
 * 
 * This contract is designed to work with a bridge system connecting Kaia and BSC.
 * Features:
 * 1. Initial supply: 0 (tokens are minted through bridge)
 * 2. Mintable: Only authorized minters (bridge contracts) can mint
 * 3. Burnable: Users can burn tokens to unlock on Kaia chain
 * 4. Maximum supply: Same as Kaia's MAX_SUPPLY (1,000,000,000 tokens)
 * 5. Pausable: Emergency pause functionality (TimelockController only)
 * 6. Permit: Signature-based approvals (gas savings)
 */
contract XPassTokenBSC is ERC20, ERC20Pausable, Ownable, AccessControlEnumerable, ERC20Permit {
    
    // Maximum supply (1,000,000,000 tokens) - same as Kaia's MAX_SUPPLY
    uint256 private constant MAX_SUPPLY = 1_000_000_000 * 10**18;
    
    // Minimum amount for mint and burn operations (0.1 tokens) - default value
    uint256 public constant MIN_MINT_BURN_AMOUNT = 1 * 10**17; // 0.1 * 10**18
    
    // Minimum amount for mint and burn operations (can be updated via updateMinMintBurnAmount)
    uint256 public minMintBurnAmount;
    
    // Role for minters (bridge contracts or authorized addresses)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // Total amount of tokens minted so far
    uint256 public totalMinted;
    
    // Track processed mint transactions to prevent duplicates
    // Key: lockId (from Kaia bridge) -> processed
    mapping(bytes32 => bool) public processedMints;
    
    // Custom events
    event TokensMinted(address indexed to, uint256 amount, address indexed minter, bytes32 indexed lockId);
    event TokensBurned(address indexed from, uint256 amount, address indexed kaiaAddress);
    event MaxSupplyUpdated(uint256 oldMaxSupply, uint256 newMaxSupply);
    event TokensPaused();
    event TokensUnpaused();
    event TimelockControllerChanged(address indexed oldTimelockController, address indexed newTimelockController);
    event MinMintBurnAmountUpdated(uint256 oldAmount, uint256 newAmount);
    
    // State variable to hold the address of the TimelockController contract
    address public timelockController;

    /**
     * @dev Modifier to restrict function calls to only the TimelockController address.
     */
    modifier onlyTimelock() {
        require(msg.sender == timelockController, "XPassTokenBSC: caller is not the timelock controller");
        _;
    }
    
    /**
     * @dev Contract constructor
     * @param initialOwner Initial owner address (can be Multi-Sig wallet)
     * @param initialMinter Initial minter address (bridge contract or relayer)
     * @param _timelockController The address of the deployed TimelockController.
     */
    constructor(
        address initialOwner,
        address initialMinter,
        address _timelockController
    ) 
        ERC20("XPASS Token", "XPASS")
        Ownable(initialOwner)
        ERC20Permit("XPASS Token")
    {
        require(initialOwner != address(0), "XPassTokenBSC: owner cannot be zero address");
        require(initialMinter != address(0), "XPassTokenBSC: minter cannot be zero address");
        require(_timelockController != address(0), "XPassTokenBSC: timelock controller cannot be zero address");
        
        // Grant minter role to initial minter
        _grantRole(MINTER_ROLE, initialMinter);
        
        // Set timelock controller
        timelockController = _timelockController;
        
        // Initialize minMintBurnAmount to default MIN_MINT_BURN_AMOUNT
        minMintBurnAmount = MIN_MINT_BURN_AMOUNT;
        
        // Initial supply is 0 - tokens will be minted through bridge
        totalMinted = 0;
    }
    
    /**
     * @dev Mint tokens to a specific address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @param lockId Lock ID from Kaia bridge transaction (for duplicate prevention and monitoring)
     * @notice Only addresses with MINTER_ROLE can call this function
     * @notice Total minted amount cannot exceed MAX_SUPPLY
     * @notice Minting is blocked when the token is paused
     * @notice Prevents duplicate mints using lockId from Kaia bridge
     */
    function mint(address to, uint256 amount, bytes32 lockId) external onlyRole(MINTER_ROLE) whenNotPaused {
        require(to != address(0), "XPassTokenBSC: cannot mint to zero address");
        require(amount >= minMintBurnAmount, "XPassTokenBSC: amount below minimum");
        require(totalMinted + amount <= MAX_SUPPLY, "XPassTokenBSC: exceeds maximum supply");
        require(lockId != bytes32(0), "XPassTokenBSC: lockId cannot be zero");
        require(!processedMints[lockId], "XPassTokenBSC: mint already processed");
        
        // Mark as processed
        processedMints[lockId] = true;
        
        totalMinted += amount;
        _mint(to, amount);
        
        emit TokensMinted(to, amount, msg.sender, lockId);
    }
    
    /**
     * @dev Burn tokens and specify Kaia address for unlock
     * @param kaiaAddress Kaia address to receive unlocked tokens
     * @param amount Amount of tokens to burn
     * @notice Users can burn their tokens and specify which Kaia address should receive the unlocked tokens
     * @notice This function emits TokensBurned event with kaiaAddress for relayer to process
     */
    function burnToKaia(address kaiaAddress, uint256 amount) public {
        require(kaiaAddress != address(0), "XPassTokenBSC: kaiaAddress cannot be zero address");
        require(amount >= minMintBurnAmount, "XPassTokenBSC: amount below minimum");
        
        // Burn tokens first (this will revert if balance is insufficient)
        _burn(msg.sender, amount);
        
        // Decrease totalMinted when tokens are burned (after successful burn)
        totalMinted -= amount;
        
        emit TokensBurned(msg.sender, amount, kaiaAddress);
    }
    
    /**
     * @dev Burn tokens from an account and specify Kaia address for unlock
     * @param account Address to burn tokens from
     * @param kaiaAddress Kaia address to receive unlocked tokens
     * @param amount Amount of tokens to burn
     * @notice Users can burn tokens from an approved account and specify which Kaia address should receive the unlocked tokens
     * @notice This function emits TokensBurned event with kaiaAddress for relayer to process
     */
    function burnFromToKaia(address account, address kaiaAddress, uint256 amount) public {
        require(account != address(0), "XPassTokenBSC: account cannot be zero address");
        require(kaiaAddress != address(0), "XPassTokenBSC: kaiaAddress cannot be zero address");
        require(amount >= minMintBurnAmount, "XPassTokenBSC: amount below minimum");
        
        // Spend allowance and burn tokens first (this will revert if balance/allowance is insufficient)
        _spendAllowance(account, msg.sender, amount);
        _burn(account, amount);
        
        // Decrease totalMinted when tokens are burned (after successful burn)
        totalMinted -= amount;
        
        emit TokensBurned(account, amount, kaiaAddress);
    }
    
    /**
     * @dev Pause token transfers (TimelockController only)
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution.
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     */
    function pause() public onlyTimelock {
        require(timelockController != address(0), "XPassTokenBSC: TimelockController has been removed");
        _pause();
        emit TokensPaused();
    }
    
    /**
     * @dev Unpause token transfers (TimelockController only)
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution.
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     */
    function unpause() public onlyTimelock {
        require(timelockController != address(0), "XPassTokenBSC: TimelockController has been removed");
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
        super._update(from, to, amount);
    }
    
    
    /**
     * @dev Version function used by ERC20Permit
     */
    function version() public pure returns (string memory) {
        return "1";
    }

    /**
     * @dev Get the maximum supply
     * @return Maximum supply of tokens
     */
    function maxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }
        
    /**
     * @dev Get the remaining mintable supply
     * @return Remaining amount that can be minted
     */
    function remainingMintableSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalMinted;
    }
    
    /**
     * @dev Check if a given amount can be minted
     * @param amount Amount to check
     * @return True if amount can be minted without exceeding MAX_SUPPLY
     */
    function canMint(uint256 amount) external view returns (bool) {
        return totalMinted + amount <= MAX_SUPPLY;
    }
    
    /**
     * @dev Changes the TimelockController address
     * @param newTimelockController New TimelockController address
     * @notice Only the owner can call this function
     * @notice This allows upgrading the TimelockController if needed
     */
    function changeTimelockController(address newTimelockController) external onlyOwner {
        require(newTimelockController != address(0), "XPassTokenBSC: new timelock controller cannot be zero address");
        require(newTimelockController != timelockController, "XPassTokenBSC: new timelock controller cannot be current timelock controller");
        
        address oldTimelockController = timelockController;
        timelockController = newTimelockController;
        
        emit TimelockControllerChanged(oldTimelockController, newTimelockController);
    }
    
    /**
     * @dev Internal function to remove the TimelockController (sets to zero address)
     * @notice This is only called internally when needed
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
     * @dev Grant minter role to a new address
     * @param account Address to grant minter role to
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function grantMinterRole(address account) external onlyTimelock {
        require(timelockController != address(0), "XPassTokenBSC: TimelockController has been removed");
        require(account != address(0), "XPassTokenBSC: account cannot be zero address");
        _grantRole(MINTER_ROLE, account);
    }
    
    /**
     * @dev Revoke minter role from an address
     * @param account Address to revoke minter role from
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function revokeMinterRole(address account) external onlyTimelock {
        require(timelockController != address(0), "XPassTokenBSC: TimelockController has been removed");
        require(account != address(0), "XPassTokenBSC: account cannot be zero address");
        _revokeRole(MINTER_ROLE, account);
    }
    
    /**
     * @dev Check if an address has the MINTER_ROLE
     * @param account Address to check
     * @return True if the address has MINTER_ROLE, false otherwise
     */
    function isMinter(address account) external view returns (bool) {
        return hasRole(MINTER_ROLE, account);
    }
    
    /**
     * @dev Get the total number of addresses with MINTER_ROLE
     * @return The number of minters
     */
    function getMinterCount() external view returns (uint256) {
        return getRoleMemberCount(MINTER_ROLE);
    }
    
    /**
     * @dev Get the address of a minter at a specific index
     * @param index The index of the minter (0-based)
     * @return The address of the minter at the given index
     * @notice Use getMinterCount() to get the total number of minters
     */
    function getMinterAt(uint256 index) external view returns (address) {
        return getRoleMember(MINTER_ROLE, index);
    }
    
    /**
     * @dev Check if a mint has been processed
     * @param lockId Lock ID from Kaia bridge transaction
     * @return True if mint has been processed
     */
    function isMintProcessed(bytes32 lockId) external view returns (bool) {
        return processedMints[lockId];
    }
    
    /**
     * @dev Update minimum mint and burn amount
     * @param newMinMintBurnAmount New minimum mint and burn amount
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function updateMinMintBurnAmount(uint256 newMinMintBurnAmount) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassTokenBSC: TimelockController has been removed");
        require(newMinMintBurnAmount > 0, "XPassTokenBSC: min amount must be greater than zero");
        require(newMinMintBurnAmount != minMintBurnAmount, "XPassTokenBSC: amount unchanged");
        
        uint256 oldAmount = minMintBurnAmount;
        minMintBurnAmount = newMinMintBurnAmount;
        
        emit MinMintBurnAmountUpdated(oldAmount, newMinMintBurnAmount);
    }

    /**
     * @dev Override renounceOwnership to prevent renouncement when paused
     * @notice This prevents ownership renouncement when token is paused to avoid permanent pause
     * @notice If not paused, TimelockController is automatically removed before renouncement
     * @notice Requires at least one MINTER_ROLE account to exist to prevent permanent minting disable
     */
    function renounceOwnership() public override onlyOwner {
        // Prevent renouncement when token is paused
        require(!paused(), "XPassTokenBSC: cannot renounce ownership while paused");
        
        // Ensure at least one MINTER_ROLE account exists
        uint256 minterCount = getRoleMemberCount(MINTER_ROLE);
        require(minterCount > 0, "XPassTokenBSC: cannot renounce ownership without any minter");
        
        // Remove TimelockController before renouncing ownership (only when not paused)
        if (timelockController != address(0)) {
            _removeTimelockController();
        }
        
        // Call parent renounceOwnership
        super.renounceOwnership();
    }
}

