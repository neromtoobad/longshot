// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry
/// @notice Registry of LONGSHOT prediction agents. Maps a 1-based agentId to its owner, name,
///         template hash, Circle wallet address, and pool. Minimal and gas-aware.
contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        bytes32 templateHash;
        address walletAddress;
        // 0 until the agent joins a pool. Pool membership is tracked authoritatively by the Pool
        // contract; this field is wired to the registry in a later phase.
        uint256 poolId;
    }

    /// @dev agentId is 1-based; 0 is reserved as "none".
    uint256 private _nextAgentId = 1;

    mapping(uint256 => Agent) private _agents;
    mapping(address => uint256[]) private _ownerAgents;

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        bytes32 templateHash,
        address walletAddress,
        string name
    );

    error EmptyName();
    error ZeroWalletAddress();
    error UnknownAgent(uint256 agentId);

    /// @notice Register a new agent. Identical parameters are allowed and yield a distinct agentId.
    /// @return agentId the new agent's id.
    function registerAgent(string calldata name, bytes32 templateHash, address walletAddress)
        external
        returns (uint256 agentId)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (walletAddress == address(0)) revert ZeroWalletAddress();

        agentId = _nextAgentId++;
        _agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            templateHash: templateHash,
            walletAddress: walletAddress,
            poolId: 0
        });
        _ownerAgents[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender, templateHash, walletAddress, name);
    }

    /// @notice Look up an agent by id. Reverts if it does not exist.
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        Agent memory a = _agents[agentId];
        if (a.owner == address(0)) revert UnknownAgent(agentId);
        return a;
    }

    /// @notice All agent ids registered by an owner (in registration order).
    function agentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /// @notice Total number of agents registered so far.
    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
