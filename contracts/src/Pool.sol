// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Pool
/// @notice A LONGSHOT tournament pool: escrows USDC entry fees, records agent prediction
///         commitments, stores fixture results, and pays out the prize pool to the top agents.
///         Settles in USDC at 6 decimals.
///
/// @dev Trust model (MVP): a single owner-set `resolver` posts fixture results and agent scores
///      and triggers finalize. This is the "signed resolver" the build plan accepts for MVP.
///      TODO(trust upgrade): replace the resolver with UMA's optimistic oracle for fixture
///      resolution — see circlefin/arc-prediction-markets (EventBasedPredictionMarket.sol).
///
/// @dev Scoring note: predictions are stored on-chain only as hashes (commitments), so the
///      contract cannot derive points from them. The resolver computes scores off-chain (exact
///      score = 3, correct result = 1, correct goal difference = 1; see BUILD_GUIDE) and records
///      each agent's cumulative total via `recordScore`. `finalize` ranks by those recorded totals.
contract Pool {
    using SafeERC20 for IERC20;

    enum Status {
        Open,
        Closed,
        Finalized
    }

    struct PoolInfo {
        string tournament;
        uint256 entryFee; // USDC base units (6 decimals)
        uint256 budgetPerAgent; // USDC base units; the agent data budget (enforced off-chain)
        uint16[] prizeSplitBps; // basis points per winning rank; must sum to 10_000
        Status status;
        uint256 prizePool; // escrowed USDC, decremented as prizes are paid
        uint256[] agentIds; // participants, in join order
    }

    struct Result {
        bool resolved;
        uint8 homeScore;
        uint8 awayScore;
    }

    uint256 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    address public owner;
    address public resolver;
    address public runner;

    uint256 private _nextPoolId = 1;
    mapping(uint256 => PoolInfo) private _pools;

    /// @dev pool => agent => has joined
    mapping(uint256 => mapping(uint256 => bool)) public joined;
    /// @dev pool => agent => the account that paid entry and receives prizes
    mapping(uint256 => mapping(uint256 => address)) public agentOwner;
    /// @dev pool => agent => cumulative score (recorded by the resolver)
    mapping(uint256 => mapping(uint256 => uint256)) public agentScore;
    /// @dev pool => fixture => result
    mapping(uint256 => mapping(uint256 => Result)) public results;
    /// @dev pool => agent => fixture => prediction commitment (0 = none)
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bytes32))) public predictionHash;

    event PoolCreated(uint256 indexed poolId, string tournament, uint256 entryFee, uint256 budgetPerAgent);
    event PoolClosed(uint256 indexed poolId);
    event AgentJoined(uint256 indexed poolId, uint256 indexed agentId, address indexed owner, uint256 entryFee);
    event PredictionRecorded(uint256 indexed poolId, uint256 indexed agentId, uint256 indexed fixtureId, bytes32 predictionHash);
    event FixtureResolved(uint256 indexed poolId, uint256 indexed fixtureId, uint8 homeScore, uint8 awayScore);
    event ScoreRecorded(uint256 indexed poolId, uint256 indexed agentId, uint256 cumulative);
    event PrizePaid(uint256 indexed poolId, uint256 indexed agentId, address indexed to, uint256 amount);
    event PoolFinalized(uint256 indexed poolId, uint256 paidOut);

    error NotOwner();
    error NotResolver();
    error NotAuthorized();
    error UnknownPool(uint256 poolId);
    error PoolNotOpen(uint256 poolId);
    error PoolAlreadyFinalized(uint256 poolId);
    error AlreadyJoined(uint256 poolId, uint256 agentId);
    error NotJoined(uint256 poolId, uint256 agentId);
    error FixtureAlreadyResolved(uint256 poolId, uint256 fixtureId);
    error FixtureNotResolvable(uint256 poolId, uint256 fixtureId);
    error PredictionExists(uint256 poolId, uint256 agentId, uint256 fixtureId);
    error EmptyPrizeSplit();
    error PrizeSplitNotFull(uint256 sumBps);
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        owner = msg.sender;
        resolver = msg.sender; // owner can re-point this after deploy
    }

    // --- admin ---------------------------------------------------------------

    function setResolver(address _resolver) external onlyOwner {
        if (_resolver == address(0)) revert ZeroAddress();
        resolver = _resolver;
    }

    /// @notice The authorized off-chain scheduler allowed to record predictions for agents.
    function setRunner(address _runner) external onlyOwner {
        runner = _runner;
    }

    // --- pool lifecycle ------------------------------------------------------

    /// @notice Create a pool. `prizeSplitBps` defines the payout share per winning rank and must
    ///         sum to exactly 10_000. Its length is the number of agents paid (the "top N").
    function createPool(
        string calldata tournament,
        uint256 entryFeeUSDC,
        uint256 budgetPerAgentUSDC,
        uint16[] calldata prizeSplitBps
    ) external onlyOwner returns (uint256 poolId) {
        if (prizeSplitBps.length == 0) revert EmptyPrizeSplit();
        uint256 sumBps;
        for (uint256 i = 0; i < prizeSplitBps.length; ++i) {
            sumBps += prizeSplitBps[i];
        }
        if (sumBps != BPS_DENOMINATOR) revert PrizeSplitNotFull(sumBps);

        poolId = _nextPoolId++;
        PoolInfo storage p = _pools[poolId];
        p.tournament = tournament;
        p.entryFee = entryFeeUSDC;
        p.budgetPerAgent = budgetPerAgentUSDC;
        p.prizeSplitBps = prizeSplitBps;
        p.status = Status.Open;

        emit PoolCreated(poolId, tournament, entryFeeUSDC, budgetPerAgentUSDC);
    }

    /// @notice Stop accepting new entries for a pool.
    function closePool(uint256 poolId) external onlyOwner {
        PoolInfo storage p = _existingPool(poolId);
        if (p.status != Status.Open) revert PoolNotOpen(poolId);
        p.status = Status.Closed;
        emit PoolClosed(poolId);
    }

    /// @notice Join a pool with an agent, escrowing the entry fee. Caller becomes the agent's
    ///         owner of record and receives any prize. Reverts if the pool is not open or the
    ///         agent already joined.
    function join(uint256 poolId, uint256 agentId) external {
        PoolInfo storage p = _existingPool(poolId);
        if (p.status != Status.Open) revert PoolNotOpen(poolId);
        if (joined[poolId][agentId]) revert AlreadyJoined(poolId, agentId);

        joined[poolId][agentId] = true;
        agentOwner[poolId][agentId] = msg.sender;
        p.agentIds.push(agentId);
        p.prizePool += p.entryFee;

        if (p.entryFee > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), p.entryFee);
        }

        emit AgentJoined(poolId, agentId, msg.sender, p.entryFee);
    }

    // --- predictions ---------------------------------------------------------

    /// @notice Record an agent's prediction commitment for a fixture. Callable by the agent's
    ///         owner or the authorized runner, only while the pool is not finalized and before the
    ///         fixture's result is posted. One commitment per (agent, fixture); immutable once set.
    /// @dev Wall-clock "before kickoff" is enforced by the off-chain runner (which knows kickoff
    ///      times and runs agents ahead of each match). The on-chain backstop is "before the
    ///      result is posted", which is what prevents recording a prediction once the outcome shows.
    function recordPrediction(uint256 poolId, uint256 agentId, uint256 fixtureId, bytes32 hash) external {
        PoolInfo storage p = _existingPool(poolId);
        if (p.status == Status.Finalized) revert PoolAlreadyFinalized(poolId);
        if (!joined[poolId][agentId]) revert NotJoined(poolId, agentId);
        if (msg.sender != agentOwner[poolId][agentId] && msg.sender != runner) revert NotAuthorized();
        if (results[poolId][fixtureId].resolved) revert FixtureAlreadyResolved(poolId, fixtureId);
        if (predictionHash[poolId][agentId][fixtureId] != bytes32(0)) {
            revert PredictionExists(poolId, agentId, fixtureId);
        }

        predictionHash[poolId][agentId][fixtureId] = hash;
        emit PredictionRecorded(poolId, agentId, fixtureId, hash);
    }

    // --- resolution + scoring ------------------------------------------------

    /// @notice Resolver posts a fixture's final score. Idempotent guard: reverts if already resolved.
    function resolveFixture(uint256 poolId, uint256 fixtureId, uint8 homeScore, uint8 awayScore)
        external
        onlyResolver
    {
        _existingPool(poolId);
        if (results[poolId][fixtureId].resolved) revert FixtureAlreadyResolved(poolId, fixtureId);
        results[poolId][fixtureId] = Result({resolved: true, homeScore: homeScore, awayScore: awayScore});
        emit FixtureResolved(poolId, fixtureId, homeScore, awayScore);
    }

    /// @notice Resolver records an agent's cumulative score (computed off-chain). Used by finalize.
    function recordScore(uint256 poolId, uint256 agentId, uint256 cumulative) external onlyResolver {
        _existingPool(poolId);
        if (!joined[poolId][agentId]) revert NotJoined(poolId, agentId);
        agentScore[poolId][agentId] = cumulative;
        emit ScoreRecorded(poolId, agentId, cumulative);
    }

    /// @notice Rank agents by recorded score and pay the top N (= prizeSplitBps.length) their bps
    ///         share of the escrowed prize pool, then mark the pool finalized. No payout exceeds
    ///         escrow: shares sum to <= 10_000 bps of prizePool. Ties break toward earlier joiners.
    function finalize(uint256 poolId) external onlyResolver {
        PoolInfo storage p = _existingPool(poolId);
        if (p.status == Status.Finalized) revert PoolAlreadyFinalized(poolId);

        uint256 prize = p.prizePool;
        uint256 n = p.prizeSplitBps.length;
        uint256 count = p.agentIds.length;
        uint256 winners = n < count ? n : count;

        // Partial selection sort: pick the top `winners` agents by score from a working copy.
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            ids[i] = p.agentIds[i];
        }

        uint256 paidOut;
        for (uint256 rank = 0; rank < winners; ++rank) {
            uint256 best = rank;
            for (uint256 j = rank + 1; j < count; ++j) {
                if (agentScore[poolId][ids[j]] > agentScore[poolId][ids[best]]) {
                    best = j;
                }
            }
            (ids[rank], ids[best]) = (ids[best], ids[rank]);

            uint256 amount = (prize * p.prizeSplitBps[rank]) / BPS_DENOMINATOR;
            if (amount > 0) {
                address to = agentOwner[poolId][ids[rank]];
                p.prizePool -= amount;
                paidOut += amount;
                usdc.safeTransfer(to, amount);
                emit PrizePaid(poolId, ids[rank], to, amount);
            }
        }

        p.status = Status.Finalized;
        emit PoolFinalized(poolId, paidOut);
    }

    // --- views ---------------------------------------------------------------

    function getPool(uint256 poolId) external view returns (PoolInfo memory) {
        return _existingPool(poolId);
    }

    function agentCount(uint256 poolId) external view returns (uint256) {
        return _existingPool(poolId).agentIds.length;
    }

    function totalPools() external view returns (uint256) {
        return _nextPoolId - 1;
    }

    function _existingPool(uint256 poolId) private view returns (PoolInfo storage p) {
        p = _pools[poolId];
        if (p.status == Status.Open && p.prizeSplitBps.length == 0) revert UnknownPool(poolId);
    }
}
