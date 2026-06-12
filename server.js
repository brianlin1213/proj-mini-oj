const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

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

    if (lang !== "cpp" && lang !== "c") {
        return res.json({
            status: "ERROR",
            message: "Only C and C++ are supported."
        });
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-oj-"));

    try {
        const sourceFile = lang === "cpp" ? "main.cpp" : "main.c";

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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mini OJ running at http://0.0.0.0:${PORT}`);
});