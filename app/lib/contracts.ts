// Client-safe contract addresses + minimal ABIs for the browser wallet flow (build → register →
// approve → join). Addresses are the deployed Arc testnet contracts (public).

export const POOL_ADDRESS = "0xF28BC365Fe93e8a609a81790d88EBBDD1D3557c0" as const;
export const REGISTRY_ADDRESS = "0x270128D9E2b7fa1d307CddA5Bb40aFd46d683a72" as const;
export const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;
export const WORLD_CUP_POOL_ID = 1n;
export const ENTRY_FEE = 1_000_000n; // 1 USDC

export const registryAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "templateHash", type: "bytes32" },
      { name: "walletAddress", type: "address" },
    ],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "templateHash", type: "bytes32", indexed: false },
      { name: "walletAddress", type: "address", indexed: false },
      { name: "name", type: "string", indexed: false },
    ],
  },
] as const;

export const usdcAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "join",
    stateMutability: "nonpayable",
    inputs: [
      { name: "poolId", type: "uint256" },
      { name: "agentId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
