// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title XPassTimelockController
 * @dev TimelockController configuration for XPassToken
 * 
 * This contract is used to mitigate centralization risks associated with 
 * XPassToken's pause/unpause functionality.
 * 
 * Key features:
 * - Provides careful review time for pause/unpause operations with 48-hour delay
 * - Requires multi-signature through MultiSig wallet
 * - Transparent governance process
 */
contract XPassTimelockController is TimelockController {
    
    /**
     * @dev TimelockController constructor for XPassToken
     * @param minDelay Minimum delay time for pause/unpause operations (in seconds)
     * @param admin Administrator address (MultiSig wallet address) - will be used for all roles
     */
    constructor(
        uint256 minDelay,
        address admin
    ) TimelockController(minDelay, _createArray(admin), _createArray(admin), admin) {
        // Inherit TimelockController's default configuration
        // Add XPassToken-specific settings here if needed
        // Note: Roles are already granted by the parent TimelockController constructor
        // All roles (proposer, executor, admin) are assigned to the admin address
    }
    
    /**
     * @dev Helper function to create a single-element array
     * @param addr Address to put in the array
     * @return Array containing the address
     */
    function _createArray(address addr) private pure returns (address[] memory) {
        address[] memory arr = new address[](1);
        arr[0] = addr;
        return arr;
    }

    // --- Fix for audit finding: ensure unique salt per proposal ---
    uint256 private _saltNonce;
    function _nextSalt(bytes4 tag) internal returns (bytes32) {
        _saltNonce += 1;
        return keccak256(abi.encodePacked(address(this), tag, _saltNonce));
    }
    // --------------------------------------------------------------------
    
    /**
     * @dev Creates a proposal to call pause function
     * @param xpassToken Token contract address (XPassToken or XPassTokenBSC)
     * @return proposalId Generated proposal ID
     */
    function proposePause(address xpassToken) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("pause()");
        bytes32 salt = _nextSalt(bytes4(keccak256("PAUSE")));
        proposalId = this.hashOperation(xpassToken, 0, data, bytes32(0), salt);
        this.schedule(xpassToken, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to call unpause function
     * @param xpassToken Token contract address (XPassToken or XPassTokenBSC)
     * @return proposalId Generated proposal ID
     */
    function proposeUnpause(address xpassToken) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("unpause()");
        bytes32 salt = _nextSalt(bytes4(keccak256("UNPAUSE")));
        proposalId = this.hashOperation(xpassToken, 0, data, bytes32(0), salt);
        this.schedule(xpassToken, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to grant minter role to an address in XPassTokenBSC
     * @param xpassTokenBSC XPassTokenBSC contract address
     * @param account Address to grant minter role to
     * @return proposalId Generated proposal ID
     */
    function proposeGrantMinterRole(address xpassTokenBSC, address account) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("grantMinterRole(address)", account);
        bytes32 salt = _nextSalt(bytes4(keccak256("GRANT_MINTER")));
        proposalId = this.hashOperation(xpassTokenBSC, 0, data, bytes32(0), salt);
        this.schedule(xpassTokenBSC, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to revoke minter role from an address in XPassTokenBSC
     * @param xpassTokenBSC XPassTokenBSC contract address
     * @param account Address to revoke minter role from
     * @return proposalId Generated proposal ID
     */
    function proposeRevokeMinterRole(address xpassTokenBSC, address account) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("revokeMinterRole(address)", account);
        bytes32 salt = _nextSalt(bytes4(keccak256("REVOKE_MINTER")));
        proposalId = this.hashOperation(xpassTokenBSC, 0, data, bytes32(0), salt);
        this.schedule(xpassTokenBSC, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to grant unlocker role to an address in XPassKaiaBridge
     * @param kaiaBridge XPassKaiaBridge contract address
     * @param account Address to grant unlocker role to
     * @return proposalId Generated proposal ID
     */
    function proposeGrantUnlockerRole(address kaiaBridge, address account) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("grantUnlockerRole(address)", account);
        bytes32 salt = _nextSalt(bytes4(keccak256("GRANT_UNLOCKER")));
        proposalId = this.hashOperation(kaiaBridge, 0, data, bytes32(0), salt);
        this.schedule(kaiaBridge, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to revoke unlocker role from an address in XPassKaiaBridge
     * @param kaiaBridge XPassKaiaBridge contract address
     * @param account Address to revoke unlocker role from
     * @return proposalId Generated proposal ID
     */
    function proposeRevokeUnlockerRole(address kaiaBridge, address account) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("revokeUnlockerRole(address)", account);
        bytes32 salt = _nextSalt(bytes4(keccak256("REVOKE_UNLOCKER")));
        proposalId = this.hashOperation(kaiaBridge, 0, data, bytes32(0), salt);
        this.schedule(kaiaBridge, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to update BSC token address in XPassKaiaBridge
     * @param kaiaBridge XPassKaiaBridge contract address
     * @param newBscTokenAddress New BSC token contract address
     * @return proposalId Generated proposal ID
     */
    function proposeUpdateBscTokenAddress(address kaiaBridge, address newBscTokenAddress) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("updateBscTokenAddress(address)", newBscTokenAddress);
        bytes32 salt = _nextSalt(bytes4(keccak256("UPDATE_BSC_TOKEN")));
        proposalId = this.hashOperation(kaiaBridge, 0, data, bytes32(0), salt);
        this.schedule(kaiaBridge, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to update BSC chain ID in XPassKaiaBridge
     * @param kaiaBridge XPassKaiaBridge contract address
     * @param newBscChainId New BSC chain ID
     * @return proposalId Generated proposal ID
     */
    function proposeUpdateBscChainId(address kaiaBridge, uint256 newBscChainId) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("updateBscChainId(uint256)", newBscChainId);
        bytes32 salt = _nextSalt(bytes4(keccak256("UPDATE_BSC_CHAIN")));
        proposalId = this.hashOperation(kaiaBridge, 0, data, bytes32(0), salt);
        this.schedule(kaiaBridge, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to update minimum lock/unlock amount in XPassKaiaBridge
     * @param kaiaBridge XPassKaiaBridge contract address
     * @param newMinLockUnlockAmount New minimum lock and unlock amount
     * @return proposalId Generated proposal ID
     */
    function proposeUpdateMinLockUnlockAmount(address kaiaBridge, uint256 newMinLockUnlockAmount) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("updateMinLockUnlockAmount(uint256)", newMinLockUnlockAmount);
        bytes32 salt = _nextSalt(bytes4(keccak256("UPDATE_MIN_LOCK")));
        proposalId = this.hashOperation(kaiaBridge, 0, data, bytes32(0), salt);
        this.schedule(kaiaBridge, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Creates a proposal to update minimum mint/burn amount in XPassTokenBSC
     * @param xpassTokenBSC XPassTokenBSC contract address
     * @param newMinMintBurnAmount New minimum mint and burn amount
     * @return proposalId Generated proposal ID
     */
    function proposeUpdateMinMintBurnAmount(address xpassTokenBSC, uint256 newMinMintBurnAmount) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("updateMinMintBurnAmount(uint256)", newMinMintBurnAmount);
        bytes32 salt = _nextSalt(bytes4(keccak256("UPDATE_MIN_MINT")));
        proposalId = this.hashOperation(xpassTokenBSC, 0, data, bytes32(0), salt);
        this.schedule(xpassTokenBSC, 0, data, bytes32(0), salt, getMinDelay());
    }
    
    /**
     * @dev Returns the current delay time
     * @return Currently set minimum delay time (in seconds)
     */
    function getCurrentDelay() external view returns (uint256) {
        return getMinDelay();
    }
    
    /**
     * @dev Function to check proposal state
     * @param proposalId Proposal ID to check
     * @return Proposal state (Ready, NotReady, Done, Cancelled)
     */
    function getProposalState(bytes32 proposalId) external view returns (uint8) {
        return uint8(getOperationState(proposalId));
    }
}
