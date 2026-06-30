// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReputationBond} from "../src/ReputationBond.sol";

/// Deploy ReputationBond to Arc testnet. Bonds are staked afterwards via `cast send` because Arc's
/// native USDC `transferFrom` calls a compliance precompile that forge's local EVM cannot simulate.
/// Run: forge script script/DeployBond.s.sol:DeployBond --rpc-url $RPC --broadcast --slow
contract DeployBond is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        ReputationBond bond = new ReputationBond(USDC);
        vm.stopBroadcast();
        console.log("ReputationBond:", address(bond));
        console.log("USDC:          ", USDC);
    }
}
