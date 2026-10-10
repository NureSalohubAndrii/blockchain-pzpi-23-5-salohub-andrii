import { sha256, stringifyWithSort } from './crypto';
import { type Transaction } from './transaction';

export const BLOCK_REWARD = 13;

export interface BlockHeader {
  blockNumber: number;
  timestamp: number;
  previousHash: string;
  merkelRoot: string;
  difficulty: number;
  nonce: number;
}

export interface Block {
  header: BlockHeader;
  transactions: Transaction[];
  hash: string;
}

export function calculateBlockHash(header: BlockHeader) {
  const serializedHeader = stringifyWithSort(header);
  return sha256(serializedHeader);
}

export function createCoinbaseTransaction(
  minerAddress: string,
  blockReward = BLOCK_REWARD,
  totalFees: number
): Transaction {
  return {
    sender: 'system',
    recipient: minerAddress,
    amount: blockReward + totalFees,
    fee: 0,
    nonce: 0,
    publicKey: 'system',
    signature: 'system',
  };
}

export function mineBlock(block: Block, difficulty: number) {
  const targetPrefix = '0'.repeat(difficulty);
  block.header.difficulty = difficulty;
  block.header.nonce = 0;

  while (true) {
    const hash = sha256(stringifyWithSort(block.header));

    if (hash.startsWith(targetPrefix)) {
      block.hash = hash;
      return block;
    }

    block.header.nonce++;
  }
}
