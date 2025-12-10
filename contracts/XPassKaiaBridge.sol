// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title XPassKaiaBridge
 * @dev Bridge contract for locking XPassToken on Kaia chain and unlocking based on BSC burn events
 * 
 * This contract implements a lock-and-mint bridge pattern:
 * - Kaia -> BSC: Users lock tokens here, tokens are minted on BSC
 * - BSC -> Kaia: Users burn tokens on BSC, tokens are unlocked here
 * 
 * Security features:
 * - ReentrancyGuard: Prevents reentrancy attacks
 * - AccessControl: Role-based access control for unlock operations
 * - Pausable: Emergency pause functionality (PAUSER_ROLE only, immediate execution)
 * - Duplicate prevention: Tracks processed transactions to prevent double processing
 * - TimelockController: Time-delayed execution for critical operations
 * 
 * TimelockController Usage:
 * ========================
 * The following functions require TimelockController (time-delayed execution):
 * - updateBscTokenAddress(): Update BSC token address
 * - updateBscChainId(): Update BSC chain ID
 * - updateMinLockUnlockAmount(): Update minimum lock and unlock amount
 * - grantUnlockerRole() / revokeUnlockerRole(): Manage unlocker roles
 * 
 * The following functions do NOT use TimelockController (immediate execution):
 * - pause() / unpause(): Pause/unpause the bridge (PAUSER_ROLE only, for emergency situations)
 * - grantPauserRole() / revokePauserRole(): Manage pauser roles (DEFAULT_ADMIN_ROLE only)
 * - changeTimelockController(): Update TimelockController address (DEFAULT_ADMIN_ROLE only)
 * 
 * Note: Configuration changes (updateBscTokenAddress, updateBscChainId, updateMinLockUnlockAmount)
 * now require TimelockController for enhanced security and time-delayed execution.
 */
contract XPassKaiaBridge is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // Role for addresses that can unlock tokens (off-chain relayer or multi-sig)
    bytes32 public constant UNLOCKER_ROLE = keccak256("UNLOCKER_ROLE");
    
    // Role for addresses that can pause/unpause the bridge
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Maximum batch size for batch unlock operations (DoS prevention)
    uint256 public constant MAX_BATCH_SIZE = 100;

    // Minimum amount for lock and unlock operations (0.1 tokens) - default value
    uint256 public constant MIN_LOCK_UNLOCK_AMOUNT = 1 * 10**17; // 0.1 * 10**18

    // XPassToken contract address on Kaia
    IERC20 public immutable xpassToken;
    
    // XPassToken as IERC20Permit for permit functionality
    IERC20Permit public immutable xpassTokenPermit;
  
    // BSC token contract address (for reference)
    address public bscTokenAddress;
    
    // BSC chain ID (for reference)
    uint256 public bscChainId;
    
    // Minimum lock and unlock amount (to prevent dust attacks, can be updated via updateMinLockUnlockAmount)
    uint256 public minLockUnlockAmount;
    
    // Total amount of tokens locked (for statistics)
    uint256 public totalLocked;
    
    // Total amount of tokens unlocked (for statistics)
    uint256 public totalUnlocked;
    
    // State variable to hold the address of the TimelockController contract
    address public timelockController;
    
    // Track processed unlock transactions to prevent duplicates
    // Key: keccak256(bscTxHash, amount, toAddress) -> processed
    mapping(bytes32 => bool) public processedUnlocks;
    
    // Track processed lock transactions (for reference, optional)
    // Key: lockId -> processed
    mapping(bytes32 => bool) public processedLocks;
    
    // Lock ID counter (for unique lock identification)
    uint256 private _lockIdCounter;
    
    // Custom events
    event TokensLocked(
        bytes32 indexed lockId,
        address indexed from,
        uint256 amount,
        address indexed toChainUser,
        uint256 timestamp
    );
    
    event TokensUnlocked(
        bytes32 indexed unlockId,
        address indexed to,
        uint256 amount,
        bytes32 indexed bscTxHash,
        uint256 timestamp
    );
    
    event UnlockAttempted(
        address indexed relayer,
        address indexed to,
        uint256 amount,
        bytes32 indexed bscTxHash,
        bool success
    );
    
    event BridgePaused(address indexed account);
    event BridgeUnpaused(address indexed account);
    
    event BscTokenAddressUpdated(address oldAddress, address newAddress);
    event BscChainIdUpdated(uint256 oldChainId, uint256 newChainId);
    event MinLockUnlockAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event TimelockControllerChanged(address indexed oldTimelockController, address indexed newTimelockController);
    
    /**
     * @dev Modifier to restrict function calls to only the TimelockController address.
     */
    modifier onlyTimelock() {
        require(msg.sender == timelockController, "XPassKaiaBridge: caller is not the timelock controller");
        _;
    }
    
    /**
     * @dev Constructor
     * @param _xpassToken XPassToken contract address on Kaia
     * @param _bscTokenAddress BSC token contract address (for reference)
     * @param _bscChainId BSC chain ID (56 for mainnet, 97 for testnet)
     * @param _initialOwner Initial owner address (Multi-Sig wallet)
     * @param _initialUnlocker Initial unlocker address (relayer or Multi-Sig)
     * @param _timelockController The address of the deployed TimelockController
     */
    constructor(
        address _xpassToken,
        address _bscTokenAddress,
        uint256 _bscChainId,
        address _initialOwner,
        address _initialUnlocker,
        address _timelockController
    ) {
        require(_xpassToken != address(0), "XPassKaiaBridge: xpassToken cannot be zero address");
        require(_bscTokenAddress != address(0), "XPassKaiaBridge: bscTokenAddress cannot be zero address");
        require(_initialOwner != address(0), "XPassKaiaBridge: owner cannot be zero address");
        require(_initialUnlocker != address(0), "XPassKaiaBridge: unlocker cannot be zero address");
        require(_bscChainId == 56 || _bscChainId == 97, "XPassKaiaBridge: invalid BSC chain ID");
        require(_timelockController != address(0), "XPassKaiaBridge: timelock controller cannot be zero address");
        
        xpassToken = IERC20(_xpassToken);
        xpassTokenPermit = IERC20Permit(_xpassToken);
        bscTokenAddress = _bscTokenAddress;
        bscChainId = _bscChainId;
        minLockUnlockAmount = MIN_LOCK_UNLOCK_AMOUNT; // Default: 0.1 token minimum
        timelockController = _timelockController;
        
        // Grant admin role to owner
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        
        // Grant unlocker role to initial unlocker
        _grantRole(UNLOCKER_ROLE, _initialUnlocker);
        
        // Grant pauser role to owner (for pause/unpause functionality)
        _grantRole(PAUSER_ROLE, _initialOwner);
    }
    
    /**
     * @dev Lock tokens to bridge to BSC
     * @param amount Amount of tokens to lock
     * @param toChainUser Address on BSC chain to receive minted tokens
     * @notice User must approve this contract to spend tokens first
     * @notice Emits TokensLocked event for off-chain monitoring
     */
    function lockTokens(uint256 amount, address toChainUser) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(amount >= minLockUnlockAmount, "XPassKaiaBridge: amount below minimum");
        require(toChainUser != address(0), "XPassKaiaBridge: toChainUser cannot be zero address");
        
        // Transfer tokens from user to this contract
        xpassToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Increment lock ID counter
        _lockIdCounter++;
        // Generate unique lock ID using counter and previous block hash (prevents predictability)
        bytes32 lockId = keccak256(abi.encodePacked(
            block.chainid,
            msg.sender,
            amount,
            toChainUser,
            _lockIdCounter,
            blockhash(block.number - 1) // Previous block hash for unpredictability
        ));
        
        // Mark as processed (optional, for reference)
        processedLocks[lockId] = true;
        
        // Update statistics
        totalLocked += amount;
        
        // Emit event for off-chain monitoring
        emit TokensLocked(
            lockId,
            msg.sender,
            amount,
            toChainUser,
            block.timestamp
        );
    }
    
    /**
     * @dev Lock tokens to bridge to BSC using permit (signature-based approval)
     * @param amount Amount of tokens to lock
     * @param toChainUser Address on BSC chain to receive minted tokens
     * @param deadline Deadline for the permit signature (Unix timestamp)
     * @param v Recovery byte of the signature
     * @param r First 32 bytes of the signature
     * @param s Next 32 bytes of the signature
     * @notice This function combines permit() and lockTokens() in a single transaction
     * @notice User must sign a permit message off-chain first
     * @notice Emits TokensLocked event for off-chain monitoring
     * @notice This improves UX by reducing gas costs and transaction count
     */
    function lockTokensWithPermit(
        uint256 amount,
        address toChainUser,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(amount >= minLockUnlockAmount, "XPassKaiaBridge: amount below minimum");
        require(toChainUser != address(0), "XPassKaiaBridge: toChainUser cannot be zero address");
        require(deadline >= block.timestamp, "XPassKaiaBridge: permit deadline expired");
        
        // First, execute permit to set allowance
        xpassTokenPermit.permit(
            msg.sender,        // owner
            address(this),     // spender (this bridge contract)
            amount,            // value
            deadline,          // deadline
            v, r, s            // signature
        );
        
        // Now transfer tokens from user to this contract
        xpassToken.safeTransferFrom(msg.sender, address(this), amount);
        
        // Increment lock ID counter
        _lockIdCounter++;
        // Generate unique lock ID using counter and previous block hash (prevents predictability)
        bytes32 lockId = keccak256(abi.encodePacked(
            block.chainid,
            msg.sender,
            amount,
            toChainUser,
            _lockIdCounter,
            blockhash(block.number - 1) // Previous block hash for unpredictability
        ));
        
        // Mark as processed (optional, for reference)
        processedLocks[lockId] = true;
        
        // Update statistics
        totalLocked += amount;
        
        // Emit event for off-chain monitoring
        emit TokensLocked(
            lockId,
            msg.sender,
            amount,
            toChainUser,
            block.timestamp
        );
    }
    
    /**
     * @dev Unlock tokens after BSC burn is confirmed
     * @param to Address to receive unlocked tokens
     * @param amount Amount of tokens to unlock
     * @param bscTxHash BSC transaction hash where tokens were burned
     * @notice Only addresses with UNLOCKER_ROLE can call this function
     * @notice Prevents duplicate unlocks using bscTxHash
     */
    function unlockTokens(
        address to,
        uint256 amount,
        bytes32 bscTxHash
    ) 
        external 
        onlyRole(UNLOCKER_ROLE)
        nonReentrant
        whenNotPaused
    {
        require(to != address(0), "XPassKaiaBridge: to cannot be zero address");
        require(amount >= minLockUnlockAmount, "XPassKaiaBridge: amount below minimum");
        require(bscTxHash != bytes32(0), "XPassKaiaBridge: bscTxHash cannot be zero");
        
        // Create unique unlock ID to prevent duplicates
        bytes32 unlockId = keccak256(abi.encodePacked(
            bscTxHash,
            amount,
            to
        ));
        
        require(!processedUnlocks[unlockId], "XPassKaiaBridge: unlock already processed");
        
        // Mark as processed
        processedUnlocks[unlockId] = true;
        
        // Check contract balance
        uint256 contractBalance = xpassToken.balanceOf(address(this));
        require(contractBalance >= amount, "XPassKaiaBridge: insufficient contract balance");
        
        // Update statistics
        totalUnlocked += amount;
        
        // Transfer tokens to user
        xpassToken.safeTransfer(to, amount);
        
        // Emit events
        emit TokensUnlocked(
            unlockId,
            to,
            amount,
            bscTxHash,
            block.timestamp
        );
        emit UnlockAttempted(msg.sender, to, amount, bscTxHash, true);
    }
    
    /**
     * @dev Batch unlock tokens (for efficiency)
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to unlock
     * @param bscTxHashes Array of BSC transaction hashes
     * @notice All arrays must have the same length
     * @notice Maximum batch size is limited to prevent DoS attacks
     * @notice This function is useful for processing multiple unlocks in a single transaction, saving gas
     */
    function batchUnlockTokens(
        address[] calldata recipients,
        uint256[] calldata amounts,
        bytes32[] calldata bscTxHashes
    ) 
        external 
        onlyRole(UNLOCKER_ROLE)
        nonReentrant
        whenNotPaused
    {
        require(recipients.length > 0, "XPassKaiaBridge: batch size must be greater than zero");
        require(recipients.length <= MAX_BATCH_SIZE, "XPassKaiaBridge: batch size too large");
        require(
            recipients.length == amounts.length && 
            amounts.length == bscTxHashes.length,
            "XPassKaiaBridge: array length mismatch"
        );
        
        uint256 totalAmount = 0;
        
        // Pre-compute unlock IDs to avoid duplicate calculations
        bytes32[] memory unlockIds = new bytes32[](recipients.length);
        
        // Validate all unlocks first
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "XPassKaiaBridge: invalid recipient");
            require(amounts[i] >= minLockUnlockAmount, "XPassKaiaBridge: amount below minimum");
            require(bscTxHashes[i] != bytes32(0), "XPassKaiaBridge: invalid tx hash");
            
            unlockIds[i] = keccak256(abi.encodePacked(
                bscTxHashes[i],
                amounts[i],
                recipients[i]
            ));
            
            require(!processedUnlocks[unlockIds[i]], "XPassKaiaBridge: unlock already processed");
            totalAmount += amounts[i];
        }
        
        // Check contract balance
        uint256 contractBalance = xpassToken.balanceOf(address(this));
        require(contractBalance >= totalAmount, "XPassKaiaBridge: insufficient contract balance");
        
        // Process all unlocks
        for (uint256 i = 0; i < recipients.length; i++) {
            processedUnlocks[unlockIds[i]] = true;
            totalUnlocked += amounts[i];
            
            xpassToken.safeTransfer(recipients[i], amounts[i]);
            
            emit TokensUnlocked(
                unlockIds[i],
                recipients[i],
                amounts[i],
                bscTxHashes[i],
                block.timestamp
            );
            emit UnlockAttempted(msg.sender, recipients[i], amounts[i], bscTxHashes[i], true);
        }
    }
    
    /**
     * @dev Pause the bridge
     * @notice Only PAUSER_ROLE (Multi-Sig) can call this function
     * @notice This allows immediate pause in emergency situations without timelock delay
     * @notice NO TIMELOCK: This function executes immediately (should be managed through Multi-Sig)
     */
    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
        emit BridgePaused(msg.sender);
    }
    
    /**
     * @dev Unpause the bridge
     * @notice Only PAUSER_ROLE (Multi-Sig) can call this function
     * @notice This allows immediate unpause in emergency situations without timelock delay
     * @notice NO TIMELOCK: This function executes immediately (should be managed through Multi-Sig)
     */
    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
        emit BridgeUnpaused(msg.sender);
    }
    
    /**
     * @dev Update BSC token address
     * @param newBscTokenAddress New BSC token contract address
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function updateBscTokenAddress(address newBscTokenAddress) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassKaiaBridge: TimelockController has been removed");
        require(newBscTokenAddress != address(0), "XPassKaiaBridge: new address cannot be zero");
        require(newBscTokenAddress != bscTokenAddress, "XPassKaiaBridge: address unchanged");
        
        address oldAddress = bscTokenAddress;
        bscTokenAddress = newBscTokenAddress;
        
        emit BscTokenAddressUpdated(oldAddress, newBscTokenAddress);
    }
    
    /**
     * @dev Update BSC chain ID
     * @param newBscChainId New BSC chain ID
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function updateBscChainId(uint256 newBscChainId) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassKaiaBridge: TimelockController has been removed");
        require(newBscChainId == 56 || newBscChainId == 97, "XPassKaiaBridge: invalid chain ID");
        require(newBscChainId != bscChainId, "XPassKaiaBridge: chain ID unchanged");
        
        uint256 oldChainId = bscChainId;
        bscChainId = newBscChainId;
        
        emit BscChainIdUpdated(oldChainId, newBscChainId);
    }
    
    /**
     * @dev Update minimum lock and unlock amount
     * @param newMinLockUnlockAmount New minimum lock and unlock amount
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function updateMinLockUnlockAmount(uint256 newMinLockUnlockAmount) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassKaiaBridge: TimelockController has been removed");
        require(newMinLockUnlockAmount > 0, "XPassKaiaBridge: min amount must be greater than zero");
        require(newMinLockUnlockAmount != minLockUnlockAmount, "XPassKaiaBridge: amount unchanged");
        
        uint256 oldAmount = minLockUnlockAmount;
        minLockUnlockAmount = newMinLockUnlockAmount;
        
        emit MinLockUnlockAmountUpdated(oldAmount, newMinLockUnlockAmount);
    }
    
    /**
     * @dev Grant unlocker role to an address
     * @param account Address to grant unlocker role to
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function grantUnlockerRole(address account) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassKaiaBridge: TimelockController has been removed");
        require(account != address(0), "XPassKaiaBridge: account cannot be zero address");
        _grantRole(UNLOCKER_ROLE, account);
    }
    
    /**
     * @dev Revoke unlocker role from an address
     * @param account Address to revoke unlocker role from
     * @notice Only TimelockController can call this function
     * @notice When using Multi-Sig, this requires a proposal and a time-locked execution
     * @notice If TimelockController is removed (zero address), this function becomes inactive
     * @notice TIMELOCK REQUIRED: This function uses TimelockController for time-delayed execution
     */
    function revokeUnlockerRole(address account) 
        external 
        onlyTimelock 
    {
        require(timelockController != address(0), "XPassKaiaBridge: TimelockController has been removed");
        require(account != address(0), "XPassKaiaBridge: account cannot be zero address");
        _revokeRole(UNLOCKER_ROLE, account);
    }
    
    /**
     * @dev Grant pauser role to an address
     * @param account Address to grant pauser role to
     * @notice Only DEFAULT_ADMIN_ROLE can call this function
     * @notice NO TIMELOCK: This function executes immediately (should be managed through Multi-Sig)
     * @notice Note: PAUSER_ROLE is used for pause/unpause functionality
     */
    function grantPauserRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PAUSER_ROLE, account);
    }
    
    /**
     * @dev Revoke pauser role from an address
     * @param account Address to revoke pauser role from
     * @notice Only DEFAULT_ADMIN_ROLE can call this function
     * @notice NO TIMELOCK: This function executes immediately (should be managed through Multi-Sig)
     * @notice Note: PAUSER_ROLE is used for pause/unpause functionality
     */
    function revokePauserRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PAUSER_ROLE, account);
    }
    
    /**
     * @dev Get contract token balance
     * @return Current token balance of this contract
     */
    function getContractBalance() external view returns (uint256) {
        return xpassToken.balanceOf(address(this));
    }
    
    /**
     * @dev Check if an unlock has been processed
     * @param bscTxHash BSC transaction hash
     * @param amount Amount unlocked
     * @param to Recipient address
     * @return True if unlock has been processed
     */
    function isUnlockProcessed(
        bytes32 bscTxHash,
        uint256 amount,
        address to
    ) external view returns (bool) {
        bytes32 unlockId = keccak256(abi.encodePacked(bscTxHash, amount, to));
        return processedUnlocks[unlockId];
    }
    
    /**
     * @dev Get next lock ID (for reference)
     * @return Next lock ID that will be used
     */
    function getNextLockId() external view returns (uint256) {
        return _lockIdCounter + 1;
    }
    
    /**
     * @dev Changes the TimelockController address
     * @param newTimelockController New TimelockController address
     * @notice Only DEFAULT_ADMIN_ROLE can call this function
     * @notice This allows upgrading the TimelockController if needed
     * @notice NO TIMELOCK: This function executes immediately (should be managed through Multi-Sig)
     */
    function changeTimelockController(address newTimelockController) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTimelockController != address(0), "XPassKaiaBridge: new timelock controller cannot be zero address");
        require(newTimelockController != timelockController, "XPassKaiaBridge: new timelock controller cannot be current timelock controller");
        
        address oldTimelockController = timelockController;
        timelockController = newTimelockController;
        
        emit TimelockControllerChanged(oldTimelockController, newTimelockController);
    }
    
    /**
     * @dev Get the current TimelockController address
     * @return Current TimelockController address
     */
    function getTimelockController() external view returns (address) {
        return timelockController;
    }
    
    /**
     * @dev Get the maximum batch size for batch unlock operations
     * @return Maximum batch size
     */
    function getMaxBatchSize() external pure returns (uint256) {
        return MAX_BATCH_SIZE;
    }
}

