const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = 3001;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const DATA_DIR = path.join(__dirname, "data");
const PROBLEMS_DB = path.join(DATA_DIR, "problems.json");

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(PROBLEMS_DB)) {
        fs.writeFileSync(PROBLEMS_DB, "[]");
    }
}

function readProblems() {
    ensureDataFiles();

    const raw = fs.readFileSync(PROBLEMS_DB, "utf8");

    if (!raw.trim()) {
        return [];
    }

    return JSON.parse(raw);
}

function writeProblems(problems) {
    ensureDataFiles();

    fs.writeFileSync(
        PROBLEMS_DB,
        JSON.stringify(problems, null, 2)
    );
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve) => {
        const start = Date.now();

        const child = spawn(command, args, {
            cwd: options.cwd,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;

            try {
                process.kill(-child.pid, "SIGKILL");
            } catch (err) {
                // already exited
            }
        }, options.timeout || 5000);

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            clearTimeout(timer);

            resolve({
                code,
                stdout,
                stderr,
                timedOut,
                timeMs: Date.now() - start
            });
        });
    });
}

function detectStatus(result) {
    const text = result.stdout + "\n" + result.stderr;

    if (result.timedOut) {
        return "TLE";
    }

    if (text.includes("[AC]")) {
        return "AC";
    }

    if (text.includes("[WA]")) {
        return "WA";
    }

    if (text.includes("[NO ANSWER]")) {
        return "DONE";
    }

    if (result.code !== 0) {
        return "ERROR";
    }

    return "DONE";
}

app.post("/api/run", async (req, res) => {
    const { code, input, answer, language } = req.body;

    if (!code || code.trim() === "") {
        return res.json({
            status: "ERROR",
            message: "No code provided."
        });
    }

    const lang = language || "cpp";

    if (lang !== "cpp" && lang !== "c" && lang !== "python") {
        return res.json({
            status: "ERROR",
            message: "Only C, C++, and Python are supported."
        });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-oj-"));

    try {
        const sourceFiles = {
            cpp: "main.cpp",
            c: "main.c",
            python: "main.py"
        };

        const sourceFile = sourceFiles[lang];

        fs.writeFileSync(path.join(tempDir, sourceFile), code);
        fs.writeFileSync(path.join(tempDir, "input.txt"), input || "");
        fs.writeFileSync(path.join(tempDir, "answer.txt"), answer || "");

        fs.copyFileSync(
            path.join(__dirname, "runner", "Makefile"),
            path.join(tempDir, "Makefile")
        );

        const result = await runCommand("make", ["check"], {
            cwd: tempDir,
            timeout: 5000
        });

        const status = detectStatus(result);

        res.json({
            status,
            stdout: result.stdout,
            stderr: result.stderr,
            timeMs: result.timeMs,
            exitCode: result.code,
            timedOut: result.timedOut
        });
    } catch (err) {
        res.json({
            status: "ERROR",
            message: err.toString()
        });
    } finally {
        fs.rmSync(tempDir, {
            recursive: true,
            force: true
        });
    }
});

app.post("/api/problems/save", (req, res) => {
    const {
        problemId,
        problemTitle,
        problemStatement,
        language,
        code,
        input,
        answer
    } = req.body;

    if (!problemId || !problemId.trim()) {
        return res.status(400).json({
            ok: false,
            message: "Problem ID is required."
        });
    }

    if (!problemTitle || !problemTitle.trim()) {
        return res.status(400).json({
            ok: false,
            message: "Problem title is required."
        });
    }

    const problems = readProblems();
    const now = new Date().toISOString();
    const normalizedId = problemId.trim();

    const existingIndex = problems.findIndex(
        (p) => p.problemId === normalizedId
    );

    const record = {
        problemId: normalizedId,
        problemTitle: problemTitle.trim(),
        problemStatement: problemStatement || "",
        language: language || "cpp",
        code: code || "",
        input: input || "",
        answer: answer || "",
        updatedAt: now,
        createdAt: now
    };

    if (existingIndex >= 0) {
        record.createdAt = problems[existingIndex].createdAt || now;
        problems[existingIndex] = record;
    } else {
        problems.push(record);
    }

    writeProblems(problems);

    res.json({
        ok: true,
        message: "Problem saved successfully.",
        problem: record
    });
});

app.get("/api/problems", (req, res) => {
    const problems = readProblems();

    const summary = problems.map((p) => ({
        problemId: p.problemId,
        problemTitle: p.problemTitle,
        language: p.language,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    }));

    res.json({
        ok: true,
        problems: summary
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mini OJ running at http://0.0.0.0:${PORT}`);
});