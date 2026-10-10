import { NodeServer } from '../src/node';
import { Wallet } from '../core/wallet';
import { type Transaction } from '../core/transaction';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url: string, method = 'GET', body?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  return res.json();
}

async function runDemo() {
  console.log('\nStarting 3 HTTP nodes on ports 3001, 3002, 3003...');
  const node1 = new NodeServer(3001, [
    'http://localhost:3002',
    'http://localhost:3003',
  ]);
  const node2 = new NodeServer(3002, [
    'http://localhost:3001',
    'http://localhost:3003',
  ]);
  const node3 = new NodeServer(3003, [
    'http://localhost:3001',
    'http://localhost:3002',
  ]);

  await node1.start();
  await node2.start();
  await node3.start();

  await wait(200);

  console.log('Nodes online:');
  console.log('  Node 1: http://localhost:3001 (Peers: 3002, 3003)');
  console.log('  Node 2: http://localhost:3002 (Peers: 3001, 3003)');
  console.log('  Node 3: http://localhost:3003 (Peers: 3001, 3002)');

  console.log('\nCreating accounts and funding wallets via Block #1...');
  const alice = new Wallet();
  const bob = new Wallet();
  const miner1 = new Wallet();
  const miner2 = new Wallet();

  console.log(`  Alice address : ${alice.address.slice(0, 20)}...`);
  console.log(`  Bob address   : ${bob.address.slice(0, 20)}...`);

  await request('http://localhost:3001/mine', 'POST', {
    minerAddress: alice.address,
  });

  await wait(300);

  const chain1_s1 = await request('http://localhost:3001/chain');
  const chain2_s1 = await request('http://localhost:3002/chain');
  const chain3_s1 = await request('http://localhost:3003/chain');

  console.log(`  Node 1 chain length: ${chain1_s1.length}`);
  console.log(`  Node 2 chain length: ${chain2_s1.length}`);
  console.log(`  Node 3 chain length: ${chain3_s1.length}`);

  const aliceBalNode1 = await request(
    `http://localhost:3001/balance/${alice.address}`
  );
  console.log(
    `  Alice balance on Node 1: ${aliceBalNode1.balance} coins (funded by coinbase Block #1)`
  );

  console.log('\nSimulating network partition (disconnecting Node 2)...');
  await request('http://localhost:3002/peers', 'DELETE');
  await request('http://localhost:3001/peers', 'DELETE', {
    peer: 'http://localhost:3002',
  });
  await request('http://localhost:3003/peers', 'DELETE', {
    peer: 'http://localhost:3002',
  });

  console.log('  Partition A: Node 1 and Node 3');
  console.log('  Partition B: Node 2 (isolated)');

  console.log('\nMining competing blocks during partition (creating fork)...');

  const txAliceToBob: Transaction = alice.createTransaction(
    bob.address,
    4,
    1,
    0
  );
  console.log(
    `  [Partition A] Alice sends 4 coins to Bob (txAlice, nonce 0). Submitting to Node 1...`
  );
  await request('http://localhost:3001/transactions', 'POST', txAliceToBob);

  console.log('  [Partition A] Mining Block #2A on Node 1 (miner1)...');
  await request('http://localhost:3001/mine', 'POST', {
    minerAddress: miner1.address,
  });

  await wait(300);

  console.log(
    '  [Partition B] Mining competing Block #2B on isolated Node 2 (miner2)...'
  );
  await request('http://localhost:3002/mine', 'POST', {
    minerAddress: miner2.address,
  });

  await wait(300);

  const chain1_fork = await request('http://localhost:3001/chain');
  const chain2_fork = await request('http://localhost:3002/chain');
  const chain3_fork = await request('http://localhost:3003/chain');

  console.log('\n  Fork status:');
  console.log(
    `    Node 1 Block #2 hash: ${chain1_fork.chain[2].hash.slice(0, 16)}... (Branch A, work: ${chain1_fork.work})`
  );
  console.log(
    `    Node 3 Block #2 hash: ${chain3_fork.chain[2].hash.slice(0, 16)}... (Branch A, synced from Node 1)`
  );
  console.log(
    `    Node 2 Block #2 hash: ${chain2_fork.chain[2].hash.slice(0, 16)}... (Branch B, work: ${chain2_fork.work})`
  );

  console.log('\nAdvancing Branch A to accumulate greater cumulative work...');
  console.log('  Mining Block #3A on Node 1...');
  await request('http://localhost:3001/mine', 'POST', {
    minerAddress: miner1.address,
  });

  await wait(300);

  const chain1_advanced = await request('http://localhost:3001/chain');
  console.log(
    `  Node 1 chain length: ${chain1_advanced.length}, cumulative work: ${chain1_advanced.work}`
  );
  console.log(
    `  Node 2 chain length: ${chain2_fork.length}, cumulative work: ${chain2_fork.work}`
  );

  console.log('\nReconnecting Node 2 and executing consensus sync...');
  await request('http://localhost:3002/peers', 'POST', {
    peer: 'http://localhost:3001',
  });
  console.log('  Node 2 added Node 1 back as peer.');

  console.log('  Triggering POST http://localhost:3002/sync...');
  await request('http://localhost:3002/sync', 'POST');

  await wait(300);

  const chain2_synced = await request('http://localhost:3002/chain');
  console.log(
    `  Node 2 adopted chain length: ${chain2_synced.length}, work: ${chain2_synced.work}`
  );
  console.log(
    `  Node 2 latest block hash: ${chain2_synced.chain[chain2_synced.length - 1].hash.slice(0, 16)}...`
  );
  console.log(
    `  Matches Node 1: ${chain2_synced.chain[chain2_synced.length - 1].hash === chain1_advanced.chain[chain1_advanced.length - 1].hash}`
  );

  console.log('\nVerifying network consistency across all 3 nodes...');
  const val1 = await request('http://localhost:3001/chain/validate');
  const val2 = await request('http://localhost:3002/chain/validate');
  const val3 = await request('http://localhost:3003/chain/validate');

  console.log(`  Node 1 validation: valid=${val1.valid}`);
  console.log(`  Node 2 validation: valid=${val2.valid}`);
  console.log(`  Node 3 validation: valid=${val3.valid}`);

  const bobBalNode2 = await request(
    `http://localhost:3002/balance/${bob.address}`
  );
  console.log(
    `  Bob balance on Node 2: ${bobBalNode2.balance} coins (txAlice successfully preserved in canonical history)`
  );

  console.log('\nShutting down nodes...');
  await node1.stop();
  await node2.stop();
  await node3.stop();
  console.log('All nodes stopped.');
}

runDemo().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
