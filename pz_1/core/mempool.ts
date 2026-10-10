import { type Transaction } from './transaction';
import { verifyTransaction } from './transaction';

export class Mempool {
  public transactions: Transaction[] = [];

  addTransaction(transaction: Transaction, getBalanceFn: any, getNonceFn: any) {
    if (!verifyTransaction(transaction)) {
      throw new Error('Invalid transaction signature or public key mismatch');
    }

    const isDuplicate = this.transactions.some(
      (tx) => tx.signature === transaction.signature
    );
    if (isDuplicate) {
      throw new Error('Transaction already in mempool');
    }

    const pendingTransactions = this.transactions.filter(
      (tx: Transaction) => tx.sender === transaction.sender
    );

    const confirmedNonce = getNonceFn(transaction.sender);
    const pendingTransactionsCount = pendingTransactions.length;
    const expectedNonce = confirmedNonce + pendingTransactionsCount;

    if (transaction.nonce !== expectedNonce) {
      throw new Error('Invalid nonce');
    }

    const currentBalance = getBalanceFn(transaction.sender);
    const pendingSum = pendingTransactions.reduce(
      (acc, curr) => acc + (curr.amount + curr.fee),
      0
    );
    const totalNeeds = pendingSum + transaction.amount + transaction.fee;

    if (currentBalance < totalNeeds) {
      throw new Error(
        `Insufficient funds: balance is ${currentBalance}, required ${totalNeeds}`
      );
    }

    this.transactions.push(transaction);
  }
}
