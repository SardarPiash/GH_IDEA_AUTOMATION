const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseDotenv(source) {
  const env = {};
  let i = 0;
  const n = source.length;

  const skipSpaces = () => {
    while (i < n && (source[i] === " " || source[i] === "\t")) i += 1;
  };

  while (i < n) {
    if (source[i] === "\r" || source[i] === "\n") {
      i += 1;
      continue;
    }
    skipSpaces();
    if (i >= n) break;
    if (source[i] === "#") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (source.startsWith("export", i) && /[\s=]/.test(source[i + 6] || " ")) {
      i += 6;
      skipSpaces();
    }

    const keyStart = i;
    while (i < n && /[A-Za-z0-9_.-]/.test(source[i])) i += 1;
    if (i === keyStart || (source[i] !== "=" && source[i] !== " " && source[i] !== "\t")) {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    const key = source.slice(keyStart, i);
    skipSpaces();
    if (source[i] !== "=") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    i += 1;
    skipSpaces();

    let value = "";
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      i += 1;
      while (i < n) {
        const char = source[i];
        i += 1;
        if (char === quote) break;
        if (char === "\\" && quote === '"' && i < n) {
          const next = source[i];
          i += 1;
          if (next === "n") value += "\n";
          else if (next === "r") value += "\r";
          else if (next === "t") value += "\t";
          else value += next;
        } else {
          value += char;
        }
      }
    } else {
      const valueStart = i;
      while (i < n && source[i] !== "\n" && source[i] !== "#") i += 1;
      value = source.slice(valueStart, i).trimEnd();
    }
    env[key] = value;
    while (i < n && source[i] !== "\n") i += 1;
  }
  return env;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`No env file at ${filePath}`);
    return;
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    console.error(
      `${filePath} is a directory. Remove it and mount your .env.local file instead.`
    );
    process.exit(1);
  }
  const parsed = parseDotenv(fs.readFileSync(filePath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(process.env.DOTENV_PATH || path.join(__dirname, ".env.local"));

const child = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
