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
        // Note: Roles are already granted by the parent TimelockController constructor
        // All roles (proposer, executor, admin) are assigned to the admin address
        
        // Grant PROPOSER_ROLE to this contract to enable this.schedule() calls
        // This allows the propose* functions to use this.schedule() without external role grants
        bytes32 proposerRole = PROPOSER_ROLE;
        _grantRole(proposerRole, address(this));
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
     * @param xpassToken Token contract address (XPassToken)
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
     * @param xpassToken Token contract address (XPassToken)
     * @return proposalId Generated proposal ID
     */
    function proposeUnpause(address xpassToken) external onlyRole(PROPOSER_ROLE) returns (bytes32 proposalId) {
        bytes memory data = abi.encodeWithSignature("unpause()");
        bytes32 salt = _nextSalt(bytes4(keccak256("UNPAUSE")));
        proposalId = this.hashOperation(xpassToken, 0, data, bytes32(0), salt);
        this.schedule(xpassToken, 0, data, bytes32(0), salt, getMinDelay());
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
