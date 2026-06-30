// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ReputationBond
/// @notice Reputation as capital at risk, not a score you ask to be trusted. A data provider (the
///         LONGSHOT broker) posts a USDC bond behind each evidence source it resells. When a fixture
///         resolves, the resolver records the outcome: if the source's signal held up it counts a
///         hit; if the data misled, part of the bond slashes to the harmed party. A provider with a
///         large unslashed bond is one with real money standing behind its data.
///
/// @dev This is the ERC-8004 spirit (onchain agent identity + reputation + validation) reduced to
///      the one primitive the RFBs flag as the empty lane: a slashable bond settling in USDC on Arc.
///      Settles at 6 decimals. Trust model (MVP): an owner-set `resolver` records outcomes, matching
///      Pool.sol's signed-resolver model.
contract ReputationBond {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public owner;
    address public resolver;

    struct Bond {
        address bonder; // who posted (and can withdraw) the bond for this key
        uint256 posted; // cumulative USDC ever staked
        uint256 remaining; // USDC still at stake (posted - slashed - withdrawn)
        uint256 slashed; // USDC lost to bad data
        uint64 served; // outcomes recorded against this source
        uint64 hits; // outcomes where the data held up
    }

    /// key (e.g. keccak256("form")) => bond
    mapping(bytes32 => Bond) private bonds;

    event BondPosted(bytes32 indexed key, address indexed bonder, uint256 amount, uint256 remaining);
    event OutcomeRecorded(bytes32 indexed key, bool hit, uint64 served, uint64 hits);
    event Slashed(bytes32 indexed key, uint256 amount, address indexed to, uint256 remaining);
    event Withdrawn(bytes32 indexed key, address indexed to, uint256 amount, uint256 remaining);
    event ResolverSet(address indexed resolver);

    error NotOwner();
    error NotResolver();
    error NotBonder();
    error InsufficientBond();
    error ZeroAmount();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver && msg.sender != owner) revert NotResolver();
        _;
    }

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        owner = msg.sender;
        resolver = msg.sender;
    }

    function setResolver(address r) external onlyOwner {
        resolver = r;
        emit ResolverSet(r);
    }

    /// @notice Post (or top up) the USDC bond behind a source key. Only the original bonder may add.
    function postBond(bytes32 key, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Bond storage b = bonds[key];
        if (b.bonder == address(0)) {
            b.bonder = msg.sender;
        } else if (b.bonder != msg.sender) {
            revert NotBonder();
        }
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        b.posted += amount;
        b.remaining += amount;
        emit BondPosted(key, msg.sender, amount, b.remaining);
    }

    /// @notice Record a resolved outcome for a source. A hit just counts toward the hit rate; a miss
    ///         slashes up to `slashAmount` of the remaining bond to `to` (the harmed party / treasury).
    function recordOutcome(bytes32 key, bool hit, uint256 slashAmount, address to) external onlyResolver {
        Bond storage b = bonds[key];
        b.served += 1;
        if (hit) {
            b.hits += 1;
        } else if (slashAmount > 0 && b.remaining > 0) {
            uint256 amt = slashAmount > b.remaining ? b.remaining : slashAmount;
            b.remaining -= amt;
            b.slashed += amt;
            usdc.safeTransfer(to, amt);
            emit Slashed(key, amt, to, b.remaining);
        }
        emit OutcomeRecorded(key, hit, b.served, b.hits);
    }

    /// @notice The bonder reclaims part of its remaining (unslashed) bond.
    function withdraw(bytes32 key, uint256 amount) external {
        Bond storage b = bonds[key];
        if (msg.sender != b.bonder) revert NotBonder();
        if (amount == 0) revert ZeroAmount();
        if (amount > b.remaining) revert InsufficientBond();
        b.remaining -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(key, msg.sender, amount, b.remaining);
    }

    function bondOf(bytes32 key) external view returns (Bond memory) {
        return bonds[key];
    }

    /// @notice Hit rate in basis points (0..10_000), or 0 when nothing has been served yet.
    function hitRateBps(bytes32 key) external view returns (uint256) {
        Bond storage b = bonds[key];
        if (b.served == 0) return 0;
        return (uint256(b.hits) * 10_000) / b.served;
    }
}
