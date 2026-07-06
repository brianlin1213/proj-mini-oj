require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();

const PORT = process.env.PORT || 3000;
const APP_ENV = process.env.APP_ENV || "local";
const APP_LABEL = process.env.APP_LABEL || "Local Version";

let packageInfo = {};
try {
    packageInfo = require("./package.json");
} catch (err) {
    packageInfo = {};
}

const APP_VERSION =
    process.env.APP_VERSION ||
    packageInfo.version ||
    "0.0.0";

const DATA_DIR = path.join(__dirname, "data");
const PROBLEMS_DB = path.join(DATA_DIR, "problems.json");
const RUNNER_DIR = path.join(__dirname, "runner");
const JOBS_DIR = path.join(RUNNER_DIR, "jobs");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(PROBLEMS_DB)) {
        fs.writeFileSync(PROBLEMS_DB, "[]", "utf8");
    }

    if (!fs.existsSync(JOBS_DIR)) {
        fs.mkdirSync(JOBS_DIR, { recursive: true });
    }
}

function normalizeProblem(problem) {
    const now = new Date().toISOString();

    return {
        problemId: problem.problemId || "",
        problemTitle: problem.problemTitle || "",
        problemStatement: problem.problemStatement || "",
        language: problem.language || "cpp",
        code: problem.code ?? "",
        input: problem.input ?? "",
        answer: problem.answer ?? "",
        createdAt: problem.createdAt || now,
        updatedAt: problem.updatedAt || now
    };
}

function readProblems() {
    ensureDataFiles();

    try {
        const raw = fs.readFileSync(PROBLEMS_DB, "utf8");
        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.map(normalizeProblem);
    } catch (err) {
        return [];
    }
}

function writeProblems(problems) {
    ensureDataFiles();
    fs.writeFileSync(PROBLEMS_DB, JSON.stringify(problems, null, 2), "utf8");
}

function normalizeOutput(value) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

function runCommand(command, args, options) {
    return new Promise((resolve) => {
        const start = Date.now();

        execFile(command, args, options, (error, stdout, stderr) => {
            const timeMs = Date.now() - start;

            resolve({
                error,
                stdout: stdout || "",
                stderr: stderr || "",
                timeMs
            });
        });
    });
}

function runExecutable(command, args, jobDir, input, answer) {
    return new Promise((resolve) => {
        const start = Date.now();

        const child = execFile(
            command,
            args,
            {
                cwd: jobDir,
                timeout: 3000,
                maxBuffer: 1024 * 1024
            },
            (error, stdout, stderr) => {
                const timeMs = Date.now() - start;

                if (error) {
                    const isTimeout = error.killed || error.signal === "SIGTERM";

                    resolve({
                        status: isTimeout ? "TLE" : "RE",
                        message: isTimeout ? "Time Limit Exceeded" : "Runtime Error",
                        stdout: stdout || "",
                        stderr: stderr || error.message,
                        timeMs
                    });

                    return;
                }

                const actual = normalizeOutput(stdout);
                const expected = normalizeOutput(answer);
                const accepted = actual === expected;

                resolve({
                    status: accepted ? "AC" : "WA",
                    message: accepted ? "Accepted" : "Wrong Answer",
                    stdout: stdout || "",
                    stderr: stderr || "",
                    timeMs
                });
            }
        );

        child.stdin.write(input || "");
        child.stdin.end();
    });
}

async function compileAndRunCpp(jobDir, code, input, answer) {
    const sourcePath = path.join(jobDir, "main.cpp");
    const binaryPath = path.join(jobDir, "main");

    fs.writeFileSync(sourcePath, code, "utf8");

    const compile = await runCommand(
        "g++",
        ["-std=c++17", "-O2", "-pipe", sourcePath, "-o", binaryPath],
        {
            cwd: jobDir,
            timeout: 10000,
            maxBuffer: 1024 * 1024
        }
    );

    if (compile.error) {
        return {
            status: "CE",
            message: "Compile Error",
            stdout: compile.stdout,
            stderr: compile.stderr || compile.error.message,
            timeMs: compile.timeMs
        };
    }

    return runExecutable(binaryPath, [], jobDir, input, answer);
}

async function compileAndRunC(jobDir, code, input, answer) {
    const sourcePath = path.join(jobDir, "main.c");
    const binaryPath = path.join(jobDir, "main");

    fs.writeFileSync(sourcePath, code, "utf8");

    const compile = await runCommand(
        "gcc",
        ["-std=c11", "-O2", "-pipe", sourcePath, "-o", binaryPath],
        {
            cwd: jobDir,
            timeout: 10000,
            maxBuffer: 1024 * 1024
        }
    );

    if (compile.error) {
        return {
            status: "CE",
            message: "Compile Error",
            stdout: compile.stdout,
            stderr: compile.stderr || compile.error.message,
            timeMs: compile.timeMs
        };
    }

    return runExecutable(binaryPath, [], jobDir, input, answer);
}

async function runPython(jobDir, code, input, answer) {
    const sourcePath = path.join(jobDir, "main.py");

    fs.writeFileSync(sourcePath, code, "utf8");

    return runExecutable("python3", [sourcePath], jobDir, input, answer);
}

app.get("/api/app-info", (req, res) => {
    res.json({
        appEnv: APP_ENV,
        appLabel: APP_LABEL,
        appVersion: APP_VERSION,
        port: PORT
    });
});

app.post("/api/run", async (req, res) => {
    const code = req.body.code || "";
    const input = req.body.input || "";
    const answer = req.body.answer || "";
    const language = req.body.language || "cpp";

    const jobId = crypto.randomBytes(12).toString("hex");
    const jobDir = path.join(JOBS_DIR, jobId);

    fs.mkdirSync(jobDir, { recursive: true });

    try {
        let result;

        if (language === "cpp") {
            result = await compileAndRunCpp(jobDir, code, input, answer);
        } else if (language === "c") {
            result = await compileAndRunC(jobDir, code, input, answer);
        } else if (language === "python") {
            result = await runPython(jobDir, code, input, answer);
        } else {
            result = {
                status: "ERROR",
                message: `Unsupported language: ${language}`,
                stdout: "",
                stderr: "",
                timeMs: 0
            };
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({
            status: "ERROR",
            message: err.toString(),
            stdout: "",
            stderr: err.stack || err.toString(),
            timeMs: 0
        });
    } finally {
        fs.rmSync(jobDir, {
            recursive: true,
            force: true
        });
    }
});

app.post("/api/problems/save", (req, res) => {
    const originalProblemId = (req.body.originalProblemId || "").trim();
    const problemId = (req.body.problemId || "").trim();
    const problemTitle = (req.body.problemTitle || "").trim();
    const now = new Date().toISOString();

    if (!problemId) {
        return res.status(400).json({
            ok: false,
            action: "rejected",
            message: "Problem ID is required."
        });
    }

    if (!problemTitle) {
        return res.status(400).json({
            ok: false,
            action: "rejected",
            message: "Problem title is required."
        });
    }

    const problems = readProblems();

    if (originalProblemId) {
        const originalIndex = problems.findIndex(
            (problem) => problem.problemId === originalProblemId
        );

        if (originalIndex < 0) {
            return res.status(404).json({
                ok: false,
                action: "rejected",
                message: `Original problem "${originalProblemId}" was not found.`
            });
        }

        const conflictIndex = problems.findIndex(
            (problem, index) =>
                index !== originalIndex &&
                problem.problemId === problemId
        );

        if (conflictIndex >= 0) {
            return res.status(409).json({
                ok: false,
                action: "rejected",
                message: `Problem ID "${problemId}" already exists. Rename rejected.`
            });
        }

        const existing = normalizeProblem(problems[originalIndex]);

        const updatedProblem = normalizeProblem({
            ...existing,
            problemId,
            problemTitle,
            problemStatement: req.body.problemStatement ?? existing.problemStatement,
            language: req.body.language ?? existing.language,
            code: req.body.code ?? existing.code,
            input: req.body.input ?? existing.input,
            answer: req.body.answer ?? existing.answer,
            createdAt: existing.createdAt,
            updatedAt: now
        });

        problems[originalIndex] = updatedProblem;
        writeProblems(problems);

        return res.json({
            ok: true,
            action: originalProblemId === problemId ? "updated" : "renamed",
            originalProblemId,
            problem: updatedProblem
        });
    }

    const existingIndex = problems.findIndex(
        (problem) => problem.problemId === problemId
    );

    if (existingIndex >= 0) {
        return res.status(409).json({
            ok: false,
            action: "rejected",
            message: `Problem ID "${problemId}" already exists. New problem save rejected.`
        });
    }

    const newProblem = normalizeProblem({
        problemId,
        problemTitle,
        problemStatement: req.body.problemStatement || "",
        language: req.body.language || "cpp",
        code: req.body.code ?? "",
        input: req.body.input ?? "",
        answer: req.body.answer ?? "",
        createdAt: now,
        updatedAt: now
    });

    problems.push(newProblem);
    writeProblems(problems);

    res.json({
        ok: true,
        action: "created",
        originalProblemId: "",
        problem: newProblem
    });
});

app.get("/api/problems", (req, res) => {
    const problems = readProblems();

    res.json({
        ok: true,
        problems
    });
});

app.get("/api/problems/:problemId", (req, res) => {
    const problems = readProblems();
    const problemId = req.params.problemId;

    const problem = problems.find(
        (item) => item.problemId === problemId
    );

    if (!problem) {
        return res.status(404).json({
            ok: false,
            message: "Problem not found."
        });
    }

    res.json({
        ok: true,
        problem: normalizeProblem(problem)
    });
});

ensureDataFiles();

app.listen(PORT, "0.0.0.0", () => {
    console.log(`${APP_LABEL} v${APP_VERSION} running at http://0.0.0.0:${PORT}`);
});