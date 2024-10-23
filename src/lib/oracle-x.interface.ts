import { BigNumberish } from 'ethers';

export enum MessageMatchedFlag {
  ACTIVE_MODE_QUERY = 'ACTIVE_MODE_QUERY',
  PASSIVE_MODE_QUERY = 'PASSIVE_MODE_QUERY',
  ACTIVE_MODE_COMMITMENT = 'ACTIVE_MODE_COMMITMENT',
  PASSIVE_MODE_COMMITMENT = 'PASSIVE_MODE_COMMITMENT',
}

export enum AuthMode {
  SIGNATURE = 'SIGNATURE',
  MULTISIG = 'MULTISIG',
  PROOF = 'PROOF',
}

export enum QueryMode {
  PASSIVE,
  ACTIVE,
}

export const dataCommitBySigType1 = [
  'address',
  'uint256',
  'bytes4',
  'bytes32',
  'address',
  'uint64',
  'bytes',
];

export const dataCommitBySigType2 = ['address', 'uint256', 'bytes32', 'bytes'];

export interface DataCommitment1 {
  oracleXAddr: string;
  currChainId: BigNumberish;
  callbackSelector: string;
  requestId: Uint8Array;
  callbackAddress: string;
  callbackGasLimit: BigNumberish;
  data: string;
}

export interface DataCommitment2 {
  oracleXAddr: string;
  currChainId: BigNumberish;
  subscriptionId: Uint8Array;
  data: string;
}

export interface EventLogEntity {
  eventData: any;
}

export interface ProofPublicInput {
  taskId: BigNumberish;
  callbackSelector: string;
  queryMode: string;
  requestId: Uint8Array;
  subId: Uint8Array;
  callbackAddress: string;
  callbackGasLimit: BigNumberish;
  data: string;
}

export const publicInputType = [
  'uint64',
  'bytes4',
  'bytes1',
  'bytes32',
  'bytes32',
  'address',
  'uint64',
  'bytes',
];
