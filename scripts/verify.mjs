#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(msg) {
  console.log(msg);
}

function header(title) {
  log('\n' + colors.bold + colors.cyan + '='.repeat(60) + colors.reset);
  log(colors.bold + colors.cyan + `  ${title}` + colors.reset);
  log(colors.bold + colors.cyan + '='.repeat(60) + colors.reset + '\n');
}

function checkPort(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function hasWsl() {
  if (process.platform !== 'win32') return false;
  try {
    execSync('wsl --status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function determineExecutionMode() {
  const isWindows = process.platform === 'win32';
  const redisLocal = await checkPort('127.0.0.1', 6379, 800);

  if (isWindows && !redisLocal && hasWsl()) {
    return 'wsl';
  }
  return 'direct';
}

function runStepCommand(command, mode, cwd = rootDir) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let finalCommand = command;
    let shell = true;

    if (mode === 'wsl') {
      // Convert Windows root path to WSL path if needed
      // e.g. D:\karthikeya\... -> /mnt/d/karthikeya/...
      const wslPath = cwd.replace(/^[a-zA-Z]:/, (match) => `/mnt/${match[0].toLowerCase()}`).replace(/\\/g, '/');
      finalCommand = `wsl bash -c "cd '${wslPath}' && ${command}"`;
    }

    const child = spawn(finalCommand, {
      shell: true,
      cwd,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' },
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      resolve({
        success: code === 0,
        code,
        duration,
      });
    });

    child.on('error', (err) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      resolve({
        success: false,
        error: err.message,
        duration,
      });
    });
  });
}

async function main() {
  const totalStartTime = Date.now();
  header('REACHINBOX / OUTBOX LABS — SYSTEM VERIFICATION');

  log(`${colors.gray}Timestamp: ${new Date().toISOString()}${colors.reset}`);
  log(`${colors.gray}Platform:  ${process.platform} (${process.arch})${colors.reset}`);
  log(`${colors.gray}Node:      ${process.version}${colors.reset}`);

  const mode = await determineExecutionMode();
  log(`${colors.gray}Mode:      ${mode === 'wsl' ? 'WSL2 Bridge (Active Services Detected in WSL)' : 'Native Host'}${colors.reset}\n`);

  const steps = [
    {
      name: '1. TypeScript Typechecking',
      desc: 'Checking types across shared, api, worker, and web',
      cmd: 'npm run typecheck',
    },
    {
      name: '2. Code Formatting & Linting',
      desc: 'Validating Prettier formatting across monorepo',
      cmd: 'npm run lint',
    },
    {
      name: '3. Full Test Suite (Unit & Integration)',
      desc: 'Running 11 test suites (29 tests) via Vitest',
      cmd: 'npx vitest run',
    },
    {
      name: '4. Monorepo Production Build',
      desc: 'Building packages/shared, apps/api, apps/worker, apps/web',
      cmd: 'npm run build',
    },
  ];

  const results = [];
  let allPassed = true;

  for (const step of steps) {
    log(`${colors.bold}${colors.blue}▶ [RUNNING]${colors.reset} ${step.name}`);
    log(`${colors.dim}  ${step.desc}${colors.reset}`);

    const res = await runStepCommand(step.cmd, mode);

    if (res.success) {
      log(`${colors.bold}${colors.green}✔ [PASSED]${colors.reset}  ${step.name} (${res.duration}s)\n`);
    } else {
      log(`${colors.bold}${colors.red}✖ [FAILED]${colors.reset}  ${step.name} (${res.duration}s)\n`);
      allPassed = false;
    }

    results.push({
      ...step,
      ...res,
    });

    if (!res.success) {
      log(`${colors.yellow}Verification aborted early due to step failure.${colors.reset}\n`);
      break;
    }
  }

  // Summary Table
  header('VERIFICATION SUMMARY REPORT');
  log(
    `${colors.bold}${'STEP'.padEnd(42)} ${'STATUS'.padEnd(10)} ${'DURATION'.padEnd(10)}${colors.reset}`
  );
  log(`${colors.gray}${'-'.repeat(64)}${colors.reset}`);

  for (const r of results) {
    const statusText = r.success
      ? `${colors.green}PASSED${colors.reset}`
      : `${colors.red}FAILED${colors.reset}`;
    log(`${r.name.padEnd(42)} ${statusText.padEnd(19)} ${r.duration}s`);
  }

  const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
  log(`${colors.gray}${'-'.repeat(64)}${colors.reset}`);
  log(`${colors.bold}Total Execution Time: ${totalDuration}s${colors.reset}`);

  if (allPassed) {
    log(`\n${colors.bold}${colors.green}✔ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY.${colors.reset}\n`);
    process.exit(0);
  } else {
    log(`\n${colors.bold}${colors.red}✖ VERIFICATION FAILED. Please review the error logs above.${colors.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected verification error:', err);
  process.exit(1);
});
