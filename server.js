import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const WORKSPACE = path.resolve(process.env.WORKSPACE_DIR || "./workspace");
const ENABLE_TERMINAL = process.env.ENABLE_TERMINAL === "true";
const MAX_TOOL_ROUNDS = Math.min(10, Math.max(1, Number(process.env.MAX_TOOL_ROUNDS || 6)));

await fs.mkdir(WORKSPACE, { recursive: true });
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function safePath(relativePath = "") {
  const target = path.resolve(WORKSPACE, relativePath);
  if (target !== WORKSPACE && !target.startsWith(WORKSPACE + path.sep)) {
    throw new Error("Path is outside the agent workspace.");
  }
  return target;
}

async function listFiles(dir = "") {
  const target = safePath(dir);
  const entries = await fs.readdir(target, { withFileTypes: true });
  return entries.map(e => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }));
}

async function readFile(file) {
  const target = safePath(file);
  const stat = await fs.stat(target);
  if (!stat.isFile() || stat.size > 500_000) throw new Error("File missing or larger than 500 KB.");
  return await fs.readFile(target, "utf8");
}

async function writeFile(file, content) {
  if (typeof content !== "string" || content.length > 500_000) throw new Error("Invalid or oversized content.");
  const target = safePath(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return `Saved ${file}`;
}

function runTerminal(command) {
  if (!ENABLE_TERMINAL) throw new Error("Terminal is disabled. Set ENABLE_TERMINAL=true in .env and restart to enable it.");
  if (typeof command !== "string" || command.length > 500) throw new Error("Invalid command.");
  // Terminal access is intentionally powerful. It is restricted to the workspace cwd,
  // but shell commands can still access other resources available to this OS user.
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd: WORKSPACE, shell: true, timeout: 30_000, windowsHide: true });
    let output = "";
    child.stdout.on("data", d => output += d.toString());
    child.stderr.on("data", d => output += d.toString());
    child.on("error", reject);
    child.on("close", code => resolve(`Exit code: ${code}\n${output.slice(0, 12000)}`));
  });
}

const tools = [
  { type: "function", function: { name: "list_files", description: "List files and folders in the project workspace.", parameters: { type: "object", properties: { path: { type: "string", description: "Relative folder path; use empty string for root." } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "read_file", description: "Read a text file from the project workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "write_file", description: "Create or replace a text file in the project workspace.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "run_terminal", description: "Run a shell command in the project workspace. Only works when terminal access is enabled by the owner.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"], additionalProperties: false } } }
];

async function callTool(name, args) {
  if (name === "list_files") return JSON.stringify(await listFiles(args.path || ""));
  if (name === "read_file") return await readFile(args.path);
  if (name === "write_file") return await writeFile(args.path, args.content);
  if (name === "run_terminal") return await runTerminal(args.command);
  throw new Error("Unknown tool.");
}

const BASE_SYSTEM = `You are the user's personal AI coding agent. Understand and reply naturally in Bangla, English, or Banglish; normally match the user's language. You are an expert software engineer. Clarify only when truly necessary. When asked to build or change a project, inspect workspace files first, make concrete changes using tools, then summarize exactly what changed and how to test it. Never claim a file was saved unless write_file succeeded. Keep all file operations inside the workspace. Do not expose API keys or secrets. Explain risks before destructive or security-sensitive operations. If terminal access is unavailable, do not pretend to run commands. Prefer complete, runnable code and concise setup steps.`;

app.get("/api/status", (_req, res) => {
  res.json({
    configured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL),
    model: process.env.AI_MODEL || "not configured",
    terminalEnabled: ENABLE_TERMINAL,
    workspace: "workspace/"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], systemPrompt = "", permissions = {} } = req.body || {};
    if (!process.env.AI_API_KEY) return res.status(400).json({ error: "AI_API_KEY is missing. Add it to .env and restart." });
    if (!process.env.AI_MODEL) return res.status(400).json({ error: "AI_MODEL is missing in .env." });
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: "No messages provided." });

    const allowed = {
      list_files: permissions.files !== false,
      read_file: permissions.files !== false,
      write_file: permissions.write !== false,
      run_terminal: permissions.terminal === true && ENABLE_TERMINAL
    };
    const availableTools = tools.filter(t => allowed[t.function.name]);
    const conversation = [
      { role: "system", content: BASE_SYSTEM + (systemPrompt ? `\n\nOWNER CUSTOM INSTRUCTIONS:\n${String(systemPrompt).slice(0, 8000)}` : "") },
      ...messages.slice(-30).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 20000) }))
    ];

    let answer = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await fetch(`${(process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.AI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: conversation,
          tools: availableTools.length ? availableTools : undefined,
          tool_choice: availableTools.length ? "auto" : undefined,
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "AI provider request failed." });
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("The AI provider returned an empty response.");
      conversation.push(message);
      if (message.tool_calls?.length) {
        for (const call of message.tool_calls) {
          let result;
          try {
            const args = JSON.parse(call.function.arguments || "{}");
            result = await callTool(call.function.name, args);
          } catch (err) {
            result = `Tool error: ${err.message}`;
          }
          conversation.push({ role: "tool", tool_call_id: call.id, content: String(result).slice(0, 14000) });
        }
        continue;
      }
      answer = message.content || "";
      break;
    }
    res.json({ answer: answer || "আমি কাজটি শেষ করতে পারিনি। অনুগ্রহ করে আবার চেষ্টা করো।" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unexpected server error." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, "0.0.0.0", () => console.log(`Personal AI Agent running on http://localhost:${PORT}`));
