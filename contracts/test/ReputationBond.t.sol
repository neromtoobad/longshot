// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReputationBond} from "../src/ReputationBond.sol";

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

contract ReputationBondTest is Test {
    ReputationBond private bond;
    MockUSDC private usdc;

    address private broker = makeAddr("broker");
    address private resolver = makeAddr("resolver");
    address private treasury = makeAddr("treasury");
    address private stranger = makeAddr("stranger");

    bytes32 private constant FORM = keccak256("form");
    uint256 private constant STAKE = 1_000_000; // 1 USDC

    function setUp() public {
        usdc = new MockUSDC();
        bond = new ReputationBond(address(usdc)); // test contract is owner + resolver
        bond.setResolver(resolver);

        usdc.mint(broker, 10_000_000);
        vm.prank(broker);
        usdc.approve(address(bond), type(uint256).max);
    }

    function _post(uint256 amount) internal {
        vm.prank(broker);
        bond.postBond(FORM, amount);
    }

    function test_postBond_pullsUsdcAndTracks() public {
        _post(STAKE);
        ReputationBond.Bond memory b = bond.bondOf(FORM);
        assertEq(b.bonder, broker);
        assertEq(b.posted, STAKE);
        assertEq(b.remaining, STAKE);
        assertEq(usdc.balanceOf(address(bond)), STAKE);
    }

    function test_postBond_topUpOnlyByOriginalBonder() public {
        _post(STAKE);
        usdc.mint(stranger, STAKE);
        vm.startPrank(stranger);
        usdc.approve(address(bond), STAKE);
        vm.expectRevert(ReputationBond.NotBonder.selector);
        bond.postBond(FORM, STAKE);
        vm.stopPrank();
    }

    function test_postBond_zeroReverts() public {
        vm.prank(broker);
        vm.expectRevert(ReputationBond.ZeroAmount.selector);
        bond.postBond(FORM, 0);
    }

    function test_recordOutcome_hitCountsNoSlash() public {
        _post(STAKE);
        vm.prank(resolver);
        bond.recordOutcome(FORM, true, 100_000, treasury);
        ReputationBond.Bond memory b = bond.bondOf(FORM);
        assertEq(b.served, 1);
        assertEq(b.hits, 1);
        assertEq(b.remaining, STAKE, "hit does not slash");
        assertEq(bond.hitRateBps(FORM), 10_000);
    }

    function test_recordOutcome_missSlashesToTreasury() public {
        _post(STAKE);
        vm.prank(resolver);
        bond.recordOutcome(FORM, false, 250_000, treasury);
        ReputationBond.Bond memory b = bond.bondOf(FORM);
        assertEq(b.served, 1);
        assertEq(b.hits, 0);
        assertEq(b.slashed, 250_000);
        assertEq(b.remaining, STAKE - 250_000);
        assertEq(usdc.balanceOf(treasury), 250_000);
    }

    function test_recordOutcome_slashCappedAtRemaining() public {
        _post(STAKE);
        vm.prank(resolver);
        bond.recordOutcome(FORM, false, 5_000_000, treasury); // asks more than staked
        ReputationBond.Bond memory b = bond.bondOf(FORM);
        assertEq(b.slashed, STAKE, "cannot slash more than the bond");
        assertEq(b.remaining, 0);
        assertEq(usdc.balanceOf(treasury), STAKE);
    }

    function test_recordOutcome_onlyResolver() public {
        _post(STAKE);
        vm.prank(stranger);
        vm.expectRevert(ReputationBond.NotResolver.selector);
        bond.recordOutcome(FORM, false, 100_000, treasury);
    }

    function test_hitRateBps_accumulates() public {
        _post(STAKE);
        vm.startPrank(resolver);
        bond.recordOutcome(FORM, true, 0, treasury);
        bond.recordOutcome(FORM, true, 0, treasury);
        bond.recordOutcome(FORM, false, 100_000, treasury);
        vm.stopPrank();
        assertEq(bond.hitRateBps(FORM), 6_666, "2 of 3 hits");
        ReputationBond.Bond memory b = bond.bondOf(FORM);
        assertEq(b.served, 3);
        assertEq(b.hits, 2);
    }

    function test_withdraw_bonderReclaimsRemaining() public {
        _post(STAKE);
        vm.prank(resolver);
        bond.recordOutcome(FORM, false, 250_000, treasury); // remaining 750k
        uint256 before = usdc.balanceOf(broker);
        vm.prank(broker);
        bond.withdraw(FORM, 750_000);
        assertEq(usdc.balanceOf(broker) - before, 750_000);
        assertEq(bond.bondOf(FORM).remaining, 0);
    }

    function test_withdraw_onlyBonder() public {
        _post(STAKE);
        vm.prank(stranger);
        vm.expectRevert(ReputationBond.NotBonder.selector);
        bond.withdraw(FORM, 1);
    }

    function test_withdraw_cannotExceedRemaining() public {
        _post(STAKE);
        vm.prank(broker);
        vm.expectRevert(ReputationBond.InsufficientBond.selector);
        bond.withdraw(FORM, STAKE + 1);
    }

    function test_setResolver_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(ReputationBond.NotOwner.selector);
        bond.setResolver(stranger);
    }
}
