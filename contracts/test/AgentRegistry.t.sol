// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry private registry;

    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private wallet1 = makeAddr("wallet1");
    address private wallet2 = makeAddr("wallet2");

    bytes32 private constant TEMPLATE_A = keccak256("contrarian-cheap-data");
    bytes32 private constant TEMPLATE_B = keccak256("odds-follower");

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        bytes32 templateHash,
        address walletAddress,
        string name
    );

    function setUp() public {
        registry = new AgentRegistry();
    }

    function test_register_storesFieldsAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(1, alice, TEMPLATE_A, wallet1, "Longshot One");

        vm.prank(alice);
        uint256 id = registry.registerAgent("Longshot One", TEMPLATE_A, wallet1);
        assertEq(id, 1, "first agent id is 1");

        AgentRegistry.Agent memory a = registry.getAgent(id);
        assertEq(a.owner, alice);
        assertEq(a.name, "Longshot One");
        assertEq(a.templateHash, TEMPLATE_A);
        assertEq(a.walletAddress, wallet1);
        assertEq(a.poolId, 0);
        assertEq(registry.totalAgents(), 1);
    }

    function test_register_incrementsIds() public {
        vm.prank(alice);
        uint256 id1 = registry.registerAgent("A", TEMPLATE_A, wallet1);
        vm.prank(bob);
        uint256 id2 = registry.registerAgent("B", TEMPLATE_B, wallet2);
        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalAgents(), 2);
    }

    /// @dev Duplicate handling: identical params are allowed and produce distinct agents.
    function test_register_duplicatesAreDistinct() public {
        vm.startPrank(alice);
        uint256 id1 = registry.registerAgent("Dup", TEMPLATE_A, wallet1);
        uint256 id2 = registry.registerAgent("Dup", TEMPLATE_A, wallet1);
        vm.stopPrank();

        assertTrue(id1 != id2, "duplicates get distinct ids");
        assertEq(registry.getAgent(id1).name, registry.getAgent(id2).name);

        uint256[] memory ids = registry.agentsByOwner(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
    }

    function test_agentsByOwner_segregatesByOwner() public {
        vm.prank(alice);
        registry.registerAgent("A1", TEMPLATE_A, wallet1);
        vm.prank(alice);
        registry.registerAgent("A2", TEMPLATE_B, wallet1);
        vm.prank(bob);
        registry.registerAgent("B1", TEMPLATE_A, wallet2);

        assertEq(registry.agentsByOwner(alice).length, 2);
        assertEq(registry.agentsByOwner(bob).length, 1);
        assertEq(registry.agentsByOwner(makeAddr("nobody")).length, 0);
    }

    function test_register_revertsOnEmptyName() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.EmptyName.selector);
        registry.registerAgent("", TEMPLATE_A, wallet1);
    }

    function test_register_revertsOnZeroWallet() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.ZeroWalletAddress.selector);
        registry.registerAgent("A", TEMPLATE_A, address(0));
    }

    function test_getAgent_revertsOnUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.UnknownAgent.selector, uint256(99)));
        registry.getAgent(99);
    }
}
