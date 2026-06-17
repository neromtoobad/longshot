// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Pool} from "../src/Pool.sol";

/// @dev Minimal 6-decimal USDC stand-in for tests.
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PoolTest is Test {
    Pool private pool;
    MockUSDC private usdc;

    address private alice = makeAddr("alice");
    address private bob = makeAddr("bob");
    address private carol = makeAddr("carol");
    address private runner = makeAddr("runner");

    uint256 private constant ENTRY = 1_000_000; // 1 USDC (6 decimals)
    uint256 private constant BUDGET = 5_000_000; // 5 USDC
    uint256 private constant FIXTURE = 42;

    // agentIds
    uint256 private constant A1 = 1;
    uint256 private constant A2 = 2;
    uint256 private constant A3 = 3;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new Pool(address(usdc)); // test contract is owner + resolver
        pool.setRunner(runner);

        for (uint256 i = 0; i < 3; ++i) {
            address who = [alice, bob, carol][i];
            usdc.mint(who, 100_000_000);
            vm.prank(who);
            usdc.approve(address(pool), type(uint256).max);
        }
    }

    function _createThreeWayPool() internal returns (uint256 poolId) {
        uint16[] memory split = new uint16[](3);
        split[0] = 6000;
        split[1] = 3000;
        split[2] = 1000;
        poolId = pool.createPool("World Cup", ENTRY, BUDGET, split);
    }

    // --- createPool ----------------------------------------------------------

    function test_createPool_revertsOnEmptySplit() public {
        uint16[] memory split = new uint16[](0);
        vm.expectRevert(Pool.EmptyPrizeSplit.selector);
        pool.createPool("X", ENTRY, BUDGET, split);
    }

    function test_createPool_revertsWhenSplitNot10000() public {
        uint16[] memory split = new uint16[](2);
        split[0] = 6000;
        split[1] = 3000; // sums to 9000
        vm.expectRevert(abi.encodeWithSelector(Pool.PrizeSplitNotFull.selector, uint256(9000)));
        pool.createPool("X", ENTRY, BUDGET, split);
    }

    // --- join + escrow accounting --------------------------------------------

    function test_join_escrowAccounting() public {
        uint256 poolId = _createThreeWayPool();

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        pool.join(poolId, A1);

        assertEq(usdc.balanceOf(address(pool)), ENTRY, "escrow holds entry");
        assertEq(usdc.balanceOf(alice), aliceBefore - ENTRY, "alice paid entry");
        assertEq(pool.getPool(poolId).prizePool, ENTRY, "prize pool grew");
        assertEq(pool.agentOwner(poolId, A1), alice, "owner of record");
        assertEq(pool.agentCount(poolId), 1);
        assertTrue(pool.joined(poolId, A1));
    }

    function test_join_doubleJoinReverts() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Pool.AlreadyJoined.selector, poolId, A1));
        pool.join(poolId, A1);
    }

    function test_join_revertsWhenNotOpen() public {
        uint256 poolId = _createThreeWayPool();
        pool.closePool(poolId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Pool.PoolNotOpen.selector, poolId));
        pool.join(poolId, A1);
    }

    // --- predictions ---------------------------------------------------------

    function test_recordPrediction_ownerAndRunner() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);

        bytes32 h = keccak256("2-1");
        vm.prank(alice);
        pool.recordPrediction(poolId, A1, FIXTURE, h);
        assertEq(pool.predictionHash(poolId, A1, FIXTURE), h);

        // runner may record for a different fixture
        vm.prank(runner);
        pool.recordPrediction(poolId, A1, FIXTURE + 1, keccak256("0-0"));

        // a stranger may not
        vm.prank(bob);
        vm.expectRevert(Pool.NotAuthorized.selector);
        pool.recordPrediction(poolId, A1, FIXTURE + 2, keccak256("3-3"));
    }

    function test_recordPrediction_duplicateReverts() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);
        vm.startPrank(alice);
        pool.recordPrediction(poolId, A1, FIXTURE, keccak256("2-1"));
        vm.expectRevert(abi.encodeWithSelector(Pool.PredictionExists.selector, poolId, A1, FIXTURE));
        pool.recordPrediction(poolId, A1, FIXTURE, keccak256("9-9"));
        vm.stopPrank();
    }

    function test_recordPrediction_afterResolveReverts() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);
        pool.resolveFixture(poolId, FIXTURE, 2, 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Pool.FixtureAlreadyResolved.selector, poolId, FIXTURE));
        pool.recordPrediction(poolId, A1, FIXTURE, keccak256("2-1"));
    }

    // --- resolution ----------------------------------------------------------

    function test_resolveFixture_storesAndGuardsDouble() public {
        uint256 poolId = _createThreeWayPool();
        pool.resolveFixture(poolId, FIXTURE, 3, 2);
        (bool resolved, uint8 h, uint8 a) = pool.results(poolId, FIXTURE);
        assertTrue(resolved);
        assertEq(h, 3);
        assertEq(a, 2);

        vm.expectRevert(abi.encodeWithSelector(Pool.FixtureAlreadyResolved.selector, poolId, FIXTURE));
        pool.resolveFixture(poolId, FIXTURE, 1, 1);
    }

    function test_resolveFixture_onlyResolver() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(bob);
        vm.expectRevert(Pool.NotResolver.selector);
        pool.resolveFixture(poolId, FIXTURE, 1, 0);
    }

    // --- finalize ------------------------------------------------------------

    function test_finalize_threeWayPayout() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);
        vm.prank(bob);
        pool.join(poolId, A2);
        vm.prank(carol);
        pool.join(poolId, A3);

        // carol best, alice mid, bob worst
        pool.recordScore(poolId, A1, 5);
        pool.recordScore(poolId, A2, 1);
        pool.recordScore(poolId, A3, 10);

        uint256 prize = 3 * ENTRY; // 3 USDC escrowed
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);

        pool.finalize(poolId);

        assertEq(usdc.balanceOf(carol) - carolBefore, (prize * 6000) / 10000, "carol 60%");
        assertEq(usdc.balanceOf(alice) - aliceBefore, (prize * 3000) / 10000, "alice 30%");
        assertEq(usdc.balanceOf(bob) - bobBefore, (prize * 1000) / 10000, "bob 10%");

        assertEq(usdc.balanceOf(address(pool)), 0, "escrow fully paid (exact split)");
        assertEq(pool.getPool(poolId).prizePool, 0);
        assertTrue(pool.getPool(poolId).status == Pool.Status.Finalized);
    }

    /// @dev No payout exceeds escrow: with fewer agents than prize ranks, only the present agents
    ///      are paid and the unallocated share stays in escrow.
    function test_finalize_fewerAgentsThanRanks() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);
        vm.prank(bob);
        pool.join(poolId, A2);

        pool.recordScore(poolId, A1, 9);
        pool.recordScore(poolId, A2, 4);

        uint256 prize = 2 * ENTRY;
        pool.finalize(poolId);

        // ranks 0 (60%) and 1 (30%) paid; rank 2 (10%) has no agent and stays escrowed.
        uint256 paid = (prize * 6000) / 10000 + (prize * 3000) / 10000;
        assertEq(usdc.balanceOf(address(pool)), prize - paid, "10% remains in escrow");
        assertEq(pool.getPool(poolId).prizePool, prize - paid);
    }

    function test_finalize_doubleFinalizeReverts() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(alice);
        pool.join(poolId, A1);
        pool.recordScore(poolId, A1, 1);
        pool.finalize(poolId);

        vm.expectRevert(abi.encodeWithSelector(Pool.PoolAlreadyFinalized.selector, poolId));
        pool.finalize(poolId);
    }

    function test_finalize_onlyResolver() public {
        uint256 poolId = _createThreeWayPool();
        vm.prank(bob);
        vm.expectRevert(Pool.NotResolver.selector);
        pool.finalize(poolId);
    }

    function test_getPool_revertsOnUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(Pool.UnknownPool.selector, uint256(99)));
        pool.getPool(99);
    }
}
