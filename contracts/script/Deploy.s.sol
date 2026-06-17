// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Pool} from "../src/Pool.sol";

/// @notice Deploys AgentRegistry + Pool to Arc testnet and creates one World Cup pool.
/// Run: forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast --slow
contract Deploy is Script {
    // USDC on Arc testnet — native USDC ERC-20 interface, 6 decimals.
    // Source: docs.arc.network/arc/references/contract-addresses.md (read, not guessed).
    address constant USDC = 0x3600000000000000000000000000000000000000;

    // One World Cup pool: small entry fee + a 3-way prize split.
    uint256 constant ENTRY_FEE = 1_000_000; // 1 USDC (6 decimals)
    uint256 constant BUDGET_PER_AGENT = 5_000_000; // 5 USDC data budget

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(pk);

        AgentRegistry registry = new AgentRegistry();
        Pool pool = new Pool(USDC);

        uint16[] memory split = new uint16[](3);
        split[0] = 6000; // 60%
        split[1] = 3000; // 30%
        split[2] = 1000; // 10%
        uint256 poolId = pool.createPool("World Cup 2026", ENTRY_FEE, BUDGET_PER_AGENT, split);

        vm.stopBroadcast();

        console.log("=== LONGSHOT deploy (Arc testnet) ===");
        console.log("AgentRegistry:", address(registry));
        console.log("Pool:         ", address(pool));
        console.log("USDC:         ", USDC);
        console.log("World Cup poolId:", poolId);
    }
}
