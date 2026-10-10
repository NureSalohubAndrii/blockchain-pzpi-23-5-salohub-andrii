import { stringifyWithSort } from './crypto';
import { sign, verify } from 'node:crypto';
import { sha256 } from './crypto';

export interface Transaction {
  sender: string;
  recipient: string;
  amount: number;
  fee: number;
  nonce: number;
  signature: string;
  publicKey: string;
}

export function signTransaction(transaction: Transaction, privateKey: string) {
  const { signature, ...unsignedTransaction } = transaction;

  const serialazedData = stringifyWithSort(unsignedTransaction);
  const dataBuffer = Buffer.from(serialazedData);

  const signatureBuffer = sign(null, dataBuffer, privateKey);
  transaction.signature = signatureBuffer.toString('hex');
}

export function verifyTransaction(transaction: Transaction) {
  try {
    const { signature, ...unsignedTransaction } = transaction;
    const serializedUnsignedTransaction =
      stringifyWithSort(unsignedTransaction);

    const validSignature = verify(
      null,
      Buffer.from(serializedUnsignedTransaction),
      transaction.publicKey,
      Buffer.from(signature, 'hex')
    );

    const validSender = transaction.sender === sha256(transaction.publicKey);

    return Boolean(validSignature && validSender);
  } catch (error) {
    return false;
  }
}
