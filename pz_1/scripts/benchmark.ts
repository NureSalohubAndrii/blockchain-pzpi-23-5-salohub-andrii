import { writeFileSync } from 'fs';
import { mineBlock, type Block } from '../core/block';

interface RunResult {
  run: number;
  timeMs: number;
  nonce: number;
}

interface DifficultySummary {
  difficulty: number;
  runs: RunResult[];
  avgTimeMs: number;
  medianTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  stdDevMs: number;
  avgNonce: number;
  growthFactor: number | null;
}

function createDummyBlock(difficulty: number, runIndex: number): Block {
  return {
    header: {
      blockNumber: runIndex,
      timestamp: Date.now() + runIndex,
      previousHash: '0'.repeat(64),
      merkelRoot: '0'.repeat(64),
      difficulty,
      nonce: 0,
    },
    transactions: [],
    hash: '',
  };
}

function generateSvgChart(results: DifficultySummary[], filePath: string) {
  const width = 800;
  const height = 500;
  const padL = 90;
  const padR = 40;
  const padT = 60;
  const padB = 60;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const minSec = 0.00005;
  const maxSec = 10;
  const logMin = Math.log10(minSec);
  const logMax = Math.log10(maxSec);

  const getX = (index: number) =>
    padL + (index / (results.length - 1)) * chartW;

  const getY = (sec: number) => {
    const clamped = Math.max(minSec, Math.min(maxSec, sec));
    const ratio = (Math.log10(clamped) - logMin) / (logMax - logMin);
    return padT + chartH * (1 - ratio);
  };

  const gridSteps = [0.0001, 0.001, 0.01, 0.1, 1, 10];
  let gridSvg = '';
  for (const step of gridSteps) {
    const y = getY(step);
    gridSvg += `  <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="#e0e0e0" stroke-dasharray="4" />\n`;
    gridSvg += `  <text x="${padL - 10}" y="${y + 4}" font-size="11" text-anchor="end" fill="#666">${step} s</text>\n`;
  }

  let xLabelsSvg = '';
  for (let i = 0; i < results.length; i++) {
    const x = getX(i);
    const diff = results[i].difficulty;
    xLabelsSvg += `  <line x1="${x}" y1="${height - padB}" x2="${x}" y2="${padT}" stroke="#f0f0f0" />\n`;
    xLabelsSvg += `  <text x="${x}" y="${height - padB + 20}" font-size="12" font-weight="bold" text-anchor="middle" fill="#333">${diff}</text>\n`;
  }

  const baseSec = results[0].avgTimeMs / 1000;
  const theoPoints = results
    .map((r, i) => {
      const theoSec = baseSec * Math.pow(16, r.difficulty - results[0].difficulty);
      return `${getX(i).toFixed(1)},${getY(theoSec).toFixed(1)}`;
    })
    .join(' ');

  const empPoints = results
    .map((r, i) => `${getX(i).toFixed(1)},${getY(r.avgTimeMs / 1000).toFixed(1)}`)
    .join(' ');

  let dotsAndAnnotations = '';
  for (let i = 0; i < results.length; i++) {
    const x = getX(i);
    const avgSec = results[i].avgTimeMs / 1000;
    const y = getY(avgSec);

    dotsAndAnnotations += `  <circle cx="${x}" cy="${y}" r="5" fill="#0d6efd" stroke="#ffffff" stroke-width="2" />\n`;

    const labelText =
      avgSec < 0.001
        ? `${results[i].avgTimeMs.toFixed(2)} ms`
        : avgSec < 1
        ? `${results[i].avgTimeMs.toFixed(1)} ms`
        : `${avgSec.toFixed(2)} s`;

    dotsAndAnnotations += `  <text x="${x}" y="${y - 10}" font-size="11" font-weight="bold" text-anchor="middle" fill="#0d6efd">${labelText}</text>\n`;

    if (i > 0 && results[i].growthFactor) {
      const prevX = getX(i - 1);
      const prevY = getY(results[i - 1].avgTimeMs / 1000);
      const midX = (prevX + x) / 2;
      const midY = (prevY + y) / 2 - 8;
      dotsAndAnnotations += `  <text x="${midX}" y="${midY}" font-size="10" font-weight="bold" text-anchor="middle" fill="#198754">x${results[i].growthFactor!.toFixed(1)}</text>\n`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color:#ffffff;font-family:Arial,sans-serif;">
  <text x="${width / 2}" y="32" font-size="16" font-weight="bold" text-anchor="middle" fill="#111">Залежність часу майнінгу від складності Proof of Work</text>

${gridSvg}
${xLabelsSvg}

  <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#333" stroke-width="1.5" />
  <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#333" stroke-width="1.5" />

  <text x="${width / 2}" y="${height - 15}" font-size="12" font-weight="bold" text-anchor="middle" fill="#333">Складність (кількість нулів у префіксі)</text>
  <text x="25" y="${height / 2}" font-size="12" font-weight="bold" text-anchor="middle" fill="#333" transform="rotate(-90 25 ${height / 2})">Час майнінгу (лог. шкала)</text>

  <polyline fill="none" stroke="#dc3545" stroke-width="2" stroke-dasharray="5 4" points="${theoPoints}" />
  <polyline fill="none" stroke="#0d6efd" stroke-width="2.5" points="${empPoints}" />

${dotsAndAnnotations}

  <g transform="translate(${padL + 20}, ${padT + 15})">
    <line x1="0" y1="0" x2="30" y2="0" stroke="#0d6efd" stroke-width="2.5" />
    <circle cx="15" cy="0" r="4" fill="#0d6efd" />
    <text x="38" y="4" font-size="11" fill="#333">Емпіричний час</text>

    <line x1="160" y1="0" x2="190" y2="0" stroke="#dc3545" stroke-width="2" stroke-dasharray="5 4" />
    <text x="198" y="4" font-size="11" fill="#333">Теоретичне (x16 на рівень)</text>
  </g>
</svg>`;

  writeFileSync(filePath, svg);
  console.log(`SVG chart saved to ${filePath}`);
}

function runBenchmark() {
  const difficulties = [1, 2, 3, 4, 5];
  const runsPerDifficulty = 10;
  const results: DifficultySummary[] = [];

  console.log('PoW Mining Benchmark (10 runs per difficulty level)');
  console.log('================================================================================');

  let prevAvgTime: number | null = null;

  for (const diff of difficulties) {
    const runs: RunResult[] = [];

    process.stdout.write(`Measuring difficulty ${diff}... `);

    for (let r = 1; r <= runsPerDifficulty; r++) {
      const block = createDummyBlock(diff, r);
      const start = performance.now();
      const mined = mineBlock(block, diff);
      const elapsed = performance.now() - start;

      runs.push({
        run: r,
        timeMs: elapsed,
        nonce: mined.header.nonce,
      });
    }

    const times = runs.map((r) => r.timeMs).sort((a, b) => a - b);
    const nonces = runs.map((r) => r.nonce);

    const sumTime = times.reduce((acc, t) => acc + t, 0);
    const avgTimeMs = sumTime / runsPerDifficulty;
    const medianTimeMs = (times[4] + times[5]) / 2;
    const minTimeMs = times[0];
    const maxTimeMs = times[times.length - 1];

    const variance =
      runs.reduce((acc, r) => acc + Math.pow(r.timeMs - avgTimeMs, 2), 0) /
      runsPerDifficulty;
    const stdDevMs = Math.sqrt(variance);

    const avgNonce =
      nonces.reduce((acc, n) => acc + n, 0) / runsPerDifficulty;

    const growthFactor =
      prevAvgTime !== null && prevAvgTime > 0
        ? avgTimeMs / prevAvgTime
        : null;

    prevAvgTime = avgTimeMs;

    results.push({
      difficulty: diff,
      runs,
      avgTimeMs,
      medianTimeMs,
      minTimeMs,
      maxTimeMs,
      stdDevMs,
      avgNonce,
      growthFactor,
    });

    console.log(`done. Avg: ${avgTimeMs < 1000 ? `${avgTimeMs.toFixed(2)} ms` : `${(avgTimeMs / 1000).toFixed(3)} s`}`);
  }

  console.log('\n================================================================================');
  console.log(
    'Diff  Runs   Avg Nonce       Avg Time        Growth Factor   Min Time       Max Time'
  );
  console.log('--------------------------------------------------------------------------------');

  for (const item of results) {
    const diffStr = item.difficulty.toString().padEnd(6);
    const runsStr = item.runs.length.toString().padEnd(7);
    const nonceStr = Math.round(item.avgNonce).toLocaleString().padEnd(16);
    const timeStr = (
      item.avgTimeMs < 1000
        ? `${item.avgTimeMs.toFixed(2)} ms`
        : `${(item.avgTimeMs / 1000).toFixed(3)} s`
    ).padEnd(16);
    const growthStr = (
      item.growthFactor !== null
        ? `${item.growthFactor.toFixed(2)}x`
        : '-'
    ).padEnd(16);
    const minStr = (
      item.minTimeMs < 1000
        ? `${item.minTimeMs.toFixed(2)} ms`
        : `${(item.minTimeMs / 1000).toFixed(3)} s`
    ).padEnd(15);
    const maxStr =
      item.maxTimeMs < 1000
        ? `${item.maxTimeMs.toFixed(2)} ms`
        : `${(item.maxTimeMs / 1000).toFixed(3)} s`;

    console.log(
      `${diffStr}${runsStr}${nonceStr}${timeStr}${growthStr}${minStr}${maxStr}`
    );
  }
  console.log('================================================================================');

  const jsonOutput = JSON.stringify(results, null, 2);
  writeFileSync('benchmark_results.json', jsonOutput);
  console.log('Benchmark data saved to benchmark_results.json');

  generateSvgChart(results, 'mining_benchmark.svg');
}

runBenchmark();
