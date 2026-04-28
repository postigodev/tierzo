import { spawn } from "node:child_process";

const commands = [
  ["api", "corepack", ["pnpm", "dev:api"]],
  ["web", "corepack", ["pnpm", "dev:web"]],
];

const children = commands.map(([label, command, args]) => {
  const child = spawn(command, args, {
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => write(label, chunk));
  child.stderr.on("data", (chunk) => write(label, chunk));
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });

  return child;
});

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function write(label, chunk) {
  for (const line of chunk.toString().split(/\r?\n/).filter(Boolean)) {
    console.log(`[${label}] ${line}`);
  }
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}
