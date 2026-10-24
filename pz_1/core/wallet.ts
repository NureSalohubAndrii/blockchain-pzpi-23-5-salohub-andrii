import { sha256 } from './crypto';
import { generateKeyPairSync } from 'node:crypto';
import { signTransaction, type Transaction } from './transaction';

export class Wallet {
  private readonly privateKey: string;
  public readonly publicKey: string;
  public readonly address: string;

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.address = sha256(publicKey);
  }

  getPrivateKey(): string {
    return this.privateKey;
  }

  public createTransaction(
    recipient: string,
    amount: number,
    fee: number,
    nonce: number
  ): Transaction {
    const transaction: Transaction = {
      sender: this.address,
      recipient,
      amount,
      fee,
      nonce,
      publicKey: this.publicKey,
      signature: '',
    };

    signTransaction(transaction, this.privateKey);

    return transaction;
  }
}
