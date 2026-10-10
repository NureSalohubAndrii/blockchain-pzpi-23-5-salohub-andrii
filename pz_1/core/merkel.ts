import { sha256, stringifyWithSort } from './crypto';
import { type Transaction } from './transaction';

export interface MerkelProofStep {
  transactionHash: string;
  position: 'left' | 'right';
}

export function getTransactionHash(transacrtion: Transaction) {
  return sha256(stringifyWithSort(transacrtion));
}

export function calculateMerkelRoot(transactions: Transaction[]) {
  if (transactions.length === 0) {
    return sha256('');
  }

  let currentLevel = transactions.map((tx) => getTransactionHash(tx));

  if (currentLevel.length === 1) {
    return currentLevel[0];
  }

  while (currentLevel.length > 1) {
    if (currentLevel.length % 2 !== 0) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const leftHash = currentLevel[i];
      const rightHash = currentLevel[i + 1];

      const parentHash = sha256(leftHash + rightHash);
      nextLevel.push(parentHash);
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

export function getMerkelProof(
  transactions: Transaction[],
  targetIndex: number
): MerkelProofStep[] {
  if (targetIndex < 0 || targetIndex >= transactions.length) {
    throw new Error('Transaction index out of bounds');
  }

  const proof: MerkelProofStep[] = [];
  let currentLevel = transactions.map((transaction) =>
    getTransactionHash(transaction)
  );
  let currentIndex = targetIndex;

  while (currentLevel.length > 1) {
    if (currentLevel.length % 2 !== 0) {
      currentLevel.push(currentLevel[currentLevel.length - 1]);
    }

    const isEvenIndex = currentIndex % 2 == 0;
    const siblingIndex = isEvenIndex ? currentIndex + 1 : currentIndex - 1;
    proof.push({
      transactionHash: currentLevel[siblingIndex],
      position: isEvenIndex ? 'right' : 'left',
    });

    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const leftHash = currentLevel[i];
      const rightHash = currentLevel[i + 1];
      nextLevel.push(sha256(leftHash + rightHash));
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

export function verifyMerkleProof(
  transaction: Transaction,
  proof: MerkelProofStep[],
  merkelRoot: string
): boolean {
  let currentHash = getTransactionHash(transaction);

  for (let step of proof) {
    if (step.position === 'left') {
      currentHash = sha256(step.transactionHash + currentHash);
    } else {
      currentHash = sha256(currentHash + step.transactionHash);
    }
  }

  return merkelRoot === currentHash;
}
