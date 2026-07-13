import { basicSetup } from "https://esm.sh/codemirror";
import { EditorView, keymap } from "https://esm.sh/@codemirror/view";
import { Compartment } from "https://esm.sh/@codemirror/state";
import { cpp } from "https://esm.sh/@codemirror/lang-cpp";
import { python } from "https://esm.sh/@codemirror/lang-python";
import { indentWithTab } from "https://esm.sh/@codemirror/commands";
import { bracketMatching, indentUnit } from "https://esm.sh/@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "https://esm.sh/@codemirror/autocomplete";
import { marked } from "https://esm.sh/marked";

import {
    parseMarkdownProblem,
    parseNthuProblem,
    parseGpeHelperProblem
} from "./importers.js";

const cppTemplate = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}
`;

const cTemplate = `#include <stdio.h>

int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a + b);
    return 0;
}
`;

const pythonTemplate = `a, b = map(int, input().split())
print(a + b)
`;

const templates = {
    cpp: cppTemplate,
    c: cTemplate,
    python: pythonTemplate
};

const defaultInput = "3 5";
const defaultAnswer = "8";
const defaultProblemId = "";
const defaultProblemTitle = "";
const defaultProblemStatement = "";
const defaultLanguage = "cpp";

let loadedProblemId = null;
let mathJaxRetryLeft = 0;
let mathJaxRetryTimer = null;

let currentProblemStats = createEmptyStats();

const languageExtensions = {
    cpp: cpp(),
    c: cpp(),
    python: python()
};

const languageMode = new Compartment();

const editor = new EditorView({
    doc: cppTemplate,
    extensions: [
        basicSetup,
        languageMode.of(languageExtensions.cpp),
        indentUnit.of("    "),
        closeBrackets(),
        bracketMatching(),
        keymap.of([
            {
                key: "Shift-Enter",
                run: function () {
                    window.runCode();
                    return true;
                }
            },
            indentWithTab,
            ...closeBracketsKeymap
        ])
    ],
    parent: document.getElementById("editor")
});

const editorResizeBox = document.querySelector(".editor-resize-box");

if (editorResizeBox && window.ResizeObserver) {
    const editorResizeObserver = new ResizeObserver(() => {
        editor.requestMeasure();
    });

    editorResizeObserver.observe(editorResizeBox);
}

marked.setOptions({
    gfm: true,
    breaks: false
});

function createEmptyStats() {
    return {
        attemptCount: 0,
        acceptedCount: 0,
        isAccepted: false,
        lastAttemptAt: null,
        lastAcceptedAt: null
    };
}

function normalizeStatsFromProblem(problem) {
    return {
        attemptCount: Number(problem.attemptCount || 0),
        acceptedCount: Number(problem.acceptedCount || 0),
        isAccepted: Boolean(problem.isAccepted || false),
        lastAttemptAt: problem.lastAttemptAt || null,
        lastAcceptedAt: problem.lastAcceptedAt || null
    };
}

function notify(message) {
    window.alert(message);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatAppVersion(version) {
    return String(version || "0.0.0");
}

function protectMathBeforeMarkdown(rawText) {
    const mathBlocks = [];

    const protectedText = rawText.replace(
        /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$[^\n$]+?(?<!\\)\$)/g,
        (match) => {
            const token = `@@MINIOJ_MATH_${mathBlocks.length}@@`;
            mathBlocks.push(match);
            return token;
        }
    );

    return {
        protectedText,
        mathBlocks
    };
}

function restoreMathAfterMarkdown(html, mathBlocks) {
    let restoredHtml = html;

    mathBlocks.forEach((math, index) => {
        const token = `@@MINIOJ_MATH_${index}@@`;
        restoredHtml = restoredHtml.replaceAll(token, math);
    });

    return restoredHtml;
}

function renderMarkdownWithMath(rawText) {
    const { protectedText, mathBlocks } = protectMathBeforeMarkdown(rawText);
    const html = marked.parse(protectedText);

    return restoreMathAfterMarkdown(html, mathBlocks);
}

function typesetPreview() {
    const preview = document.getElementById("problemPreview");

    if (!preview) {
        return;
    }

    if (window.MathJax && window.MathJax.typesetPromise) {
        try {
            if (window.MathJax.typesetClear) {
                window.MathJax.typesetClear([preview]);
            }

            window.MathJax.typesetPromise([preview]).catch((err) => {
                console.log("MathJax render failed:", err);
            });
        } catch (err) {
            console.log("MathJax render failed:", err);
        }

        return;
    }

    if (mathJaxRetryTimer) {
        return;
    }

    mathJaxRetryLeft = 30;

    const retry = function () {
        mathJaxRetryTimer = null;

        if (window.MathJax && window.MathJax.typesetPromise) {
            typesetPreview();
            return;
        }

        mathJaxRetryLeft--;

        if (mathJaxRetryLeft > 0) {
            mathJaxRetryTimer = setTimeout(retry, 300);
        }
    };

    mathJaxRetryTimer = setTimeout(retry, 300);
}

function updateMarkdownPreview() {
    const raw = document.getElementById("problemStatement").value;
    const preview = document.getElementById("problemPreview");

    if (!raw.trim()) {
        preview.innerHTML = `<div style="color:#9ca3af;font-style:italic;">No problem statement.</div>`;
        return;
    }

    preview.innerHTML = renderMarkdownWithMath(raw);
    typesetPreview();
}

window.updateMarkdownPreview = updateMarkdownPreview;

window.setStatementView = function (mode) {
    const workspace = document.getElementById("statementWorkspace");

    workspace.classList.remove("split-view", "edit-view", "preview-view");

    if (mode === "edit") {
        workspace.classList.add("edit-view");
    } else if (mode === "preview") {
        workspace.classList.add("preview-view");
    } else {
        workspace.classList.add("split-view");
    }

    updateMarkdownPreview();
};

function setProblemStatement(value) {
    document.getElementById("problemStatement").value = value || "";
    updateMarkdownPreview();
}

function isAcceptedStatus(status) {
    const normalized = String(status || "").trim().toUpperCase();

    return normalized === "AC" ||
        normalized === "ACCEPTED" ||
        normalized.includes("ACCEPTED");
}

function buildCurrentProblemPayload() {
    return {
        originalProblemId: loadedProblemId,
        problemId: document.getElementById("problemId").value,
        problemTitle: document.getElementById("problemTitle").value,
        problemStatement: document.getElementById("problemStatement").value,
        language: document.getElementById("language").value,
        code: editor.state.doc.toString(),
        input: document.getElementById("input").value,
        answer: document.getElementById("answer").value,

        attemptCount: currentProblemStats.attemptCount,
        acceptedCount: currentProblemStats.acceptedCount,
        isAccepted: currentProblemStats.isAccepted,
        lastAttemptAt: currentProblemStats.lastAttemptAt,
        lastAcceptedAt: currentProblemStats.lastAcceptedAt
    };
}

async function saveCurrentProblem(options = {}) {
    const notifySuccess = options.notifySuccess || false;
    const notifyFailure = options.notifyFailure !== false;
    const successMessage = options.successMessage || "Problem saved.";
    const allowRenameConfirm = options.allowRenameConfirm || false;
    const silent = options.silent || false;

    const payload = buildCurrentProblemPayload();

    const problemId = payload.problemId.trim();
    const problemTitle = payload.problemTitle.trim();

    if (!problemId) {
        if (notifyFailure && !silent) {
            notify("Save skipped.\n\nProblem ID is required.");
        }

        return {
            ok: false,
            message: "Problem ID is required."
        };
    }

    if (!problemTitle) {
        if (notifyFailure && !silent) {
            notify("Save skipped.\n\nProblem title is required.");
        }

        return {
            ok: false,
            message: "Problem title is required."
        };
    }

    if (loadedProblemId && loadedProblemId !== problemId && !allowRenameConfirm) {
        return {
            ok: false,
            message:
                `Auto-save skipped because Problem ID changed from "${loadedProblemId}" to "${problemId}". ` +
                `Use Save manually if you want to rename it.`
        };
    }

    if (loadedProblemId && loadedProblemId !== problemId && allowRenameConfirm) {
        const confirmed = window.confirm(
            `You loaded problem "${loadedProblemId}", but changed the Problem ID to "${problemId}".\n\n` +
            `Saving now will rename the original problem "${loadedProblemId}" to "${problemId}".\n\n` +
            `Do you want to continue?`
        );

        if (!confirmed) {
            return {
                ok: false,
                message: "Save cancelled."
            };
        }
    }

    try {
        const response = await fetch("/api/problems/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.ok) {
            if (notifyFailure && !silent) {
                notify(`Save rejected.\n\n${result.message || "Save failed."}`);
            }

            return result;
        }

        loadedProblemId = result.problem.problemId;
        currentProblemStats = normalizeStatsFromProblem(result.problem);

        if (notifySuccess && !silent) {
            notify(successMessage);
        }

        loadProblemList();

        return result;
    } catch (err) {
        const result = {
            ok: false,
            message: err.toString()
        };

        if (notifyFailure && !silent) {
            notify(`Save failed.\n\n${err.toString()}`);
        }

        return result;
    }
}

async function loadAppInfo() {
    const badge = document.getElementById("versionBadge");

    try {
        const response = await fetch("/api/app-info");
        const info = await response.json();

        badge.textContent =
            `${info.appLabel} v${formatAppVersion(info.appVersion)} :${info.port}`;

        badge.classList.remove("develop", "release", "local");

        if (info.appEnv === "develop") {
            badge.classList.add("develop");
        } else if (info.appEnv === "release") {
            badge.classList.add("release");
        } else {
            badge.classList.add("local");
        }
    } catch (err) {
        badge.textContent = "Unknown Version";
        badge.classList.remove("develop", "release");
        badge.classList.add("local");
    }
}

function setEditorContent(content, language) {
    const selectedLanguage = language || defaultLanguage;

    editor.dispatch({
        changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: content
        },
        effects: languageMode.reconfigure(
            languageExtensions[selectedLanguage] || languageExtensions.cpp
        )
    });
}

function applyImportedProblem(parsed) {
    loadedProblemId = null;
    currentProblemStats = createEmptyStats();

    const language = parsed.language || defaultLanguage;

    document.getElementById("problemId").value = parsed.problemId;
    document.getElementById("problemTitle").value = parsed.problemTitle;
    setProblemStatement(parsed.problemStatement);
    document.getElementById("input").value = parsed.sampleInput;
    document.getElementById("answer").value = parsed.sampleOutput;
    document.getElementById("language").value = language;

    setEditorContent(parsed.code ?? "", language);
}

window.openImportModal = function () {
    document.getElementById("importModal").classList.add("show");
    document.getElementById("rawProblemText").focus();
};

window.closeImportModal = function () {
    document.getElementById("importModal").classList.remove("show");
};

window.clearImportText = function () {
    document.getElementById("rawProblemText").value = "";
    document.getElementById("rawProblemText").focus();
};

window.importProblemFromText = async function () {
    const source = document.getElementById("importSource").value;
    const rawText = document.getElementById("rawProblemText").value;

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    try {
        let parsed;

        if (source === "markdown") {
            parsed = parseMarkdownProblem(rawText);
        } else if (source === "nthu") {
            parsed = parseNthuProblem(rawText);
        } else if (source === "gpe") {
            parsed = parseGpeHelperProblem(rawText);
        } else {
            throw new Error(`Unsupported source: ${source}`);
        }

        applyImportedProblem(parsed);

        statusBox.textContent = "Status: Imported, Auto-saving...";
        outputBox.textContent =
            `Imported problem successfully.\n` +
            `Auto-saving problem...\n` +
            `Source: ${parsed.source}\n` +
            `Problem ID: ${parsed.problemId}\n` +
            `Title: ${parsed.problemTitle}\n` +
            `Language: ${parsed.language || "cpp"}\n`;

        const saveResult = await saveCurrentProblem({
            notifySuccess: false,
            notifyFailure: false,
            silent: true
        });

        if (!saveResult.ok) {
            statusBox.textContent = "Status: Imported, Auto-save Failed";
            outputBox.textContent +=
                `\nAuto-save failed.\n` +
                `${saveResult.message || "Unknown save error."}\n`;

            notify(
                `Import succeeded, but auto-save failed.\n\n` +
                `${saveResult.message || "Unknown save error."}`
            );

            return;
        }

        statusBox.textContent = "Status: Imported and Saved";
        outputBox.textContent +=
            `\nAuto-save completed.\n` +
            `Action: ${saveResult.action}\n` +
            `Code editor cleared.\n`;

        closeImportModal();

        notify(
            `Import successful and saved.\n\n` +
            `Problem ID: ${saveResult.problem.problemId}\n` +
            `Title: ${saveResult.problem.problemTitle}`
        );

        editor.focus();
    } catch (err) {
        statusBox.textContent = "Status: Import Failed";
        outputBox.textContent = err.toString();
        notify(`Import failed.\n\n${err.toString()}`);
    }
};

window.loadProblemList = async function () {
    const problemList = document.getElementById("problemList");

    problemList.innerHTML = `<div class="empty-history">Loading...</div>`;

    try {
        const response = await fetch("/api/problems");
        const result = await response.json();

        if (!result.ok) {
            problemList.innerHTML =
                `<div class="empty-history">Failed to load problems.</div>`;
            notify(result.message || "Failed to load problems.");
            return;
        }

        const problems = (result.problems || []).slice().sort((a, b) => {
            const bTime = new Date(b.updatedAt || 0).getTime();
            const aTime = new Date(a.updatedAt || 0).getTime();

            return bTime - aTime;
        });

        if (problems.length === 0) {
            problemList.innerHTML =
                `<div class="empty-history">No saved problems yet.</div>`;
            return;
        }

        problemList.innerHTML = "";

        problems.forEach((problem) => {
            const item = document.createElement("div");
            item.className = "problem-item";

            const updatedAt = problem.updatedAt
                ? new Date(problem.updatedAt).toLocaleString()
                : "Unknown time";

            const encodedProblemId = encodeURIComponent(problem.problemId);
            const encodedProblemTitle = encodeURIComponent(problem.problemTitle || "");

            const attemptCount = Number(problem.attemptCount || 0);
            const acceptedCount = Number(problem.acceptedCount || 0);
            const isAccepted = Boolean(problem.isAccepted || false);

            const acClass = isAccepted ? "ac" : "not-ac";
            const acText = isAccepted ? "AC" : "Not AC";

            item.innerHTML = `
                <div class="problem-info">
                    <div class="problem-name">
                        ${escapeHtml(problem.problemId)} - ${escapeHtml(problem.problemTitle)}
                    </div>

                    <div class="problem-badges">
                        <span class="status-pill ${acClass}">
                            ${acText}
                        </span>

                        <span class="attempt-pill">
                            Attempt: ${attemptCount}
                        </span>

                        <span class="attempt-pill">
                            AC Count: ${acceptedCount}
                        </span>
                    </div>

                    <div class="problem-meta-small">
                        Language: ${escapeHtml(problem.language || "cpp")} |
                        Updated: ${escapeHtml(updatedAt)}
                    </div>
                </div>

                <div class="problem-actions">
                    <button onclick="loadProblem('${encodedProblemId}')">
                        Load
                    </button>

                    <button class="danger-button" onclick="deleteProblem('${encodedProblemId}', '${encodedProblemTitle}')">
                        Delete
                    </button>
                </div>
            `;

            problemList.appendChild(item);
        });
    } catch (err) {
        problemList.innerHTML =
            `<div class="empty-history">${escapeHtml(err.toString())}</div>`;
        notify(`Failed to load problems.\n\n${err.toString()}`);
    }
};

window.loadProblem = async function (encodedProblemId) {
    const problemId = decodeURIComponent(encodedProblemId);

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    statusBox.textContent = "Status: Loading Problem...";
    outputBox.textContent = `Loading problem ${problemId}...`;

    try {
        const response = await fetch(`/api/problems/${encodedProblemId}`);
        const result = await response.json();

        if (!result.ok) {
            statusBox.textContent = "Status: Load Failed";
            outputBox.textContent = result.message || "Problem not found.";
            notify(result.message || "Problem not found.");
            return;
        }

        const problem = result.problem;
        const language = problem.language || "cpp";

        loadedProblemId = problem.problemId;
        currentProblemStats = normalizeStatsFromProblem(problem);

        document.getElementById("problemId").value = problem.problemId || "";
        document.getElementById("problemTitle").value = problem.problemTitle || "";
        setProblemStatement(problem.problemStatement || "");
        document.getElementById("input").value = problem.input || "";
        document.getElementById("answer").value = problem.answer || "";
        document.getElementById("language").value = language;

        setEditorContent(problem.code ?? "", language);

        statusBox.textContent = "Status: Problem Loaded";
        outputBox.textContent =
            `Loaded successfully\n` +
            `Problem ID: ${problem.problemId}\n` +
            `Title: ${problem.problemTitle}\n` +
            `AC: ${problem.isAccepted ? "Yes" : "No"}\n` +
            `Attempt: ${problem.attemptCount || 0}\n` +
            `AC Count: ${problem.acceptedCount || 0}\n`;

        editor.focus();
    } catch (err) {
        statusBox.textContent = "Status: Load Failed";
        outputBox.textContent = err.toString();
        notify(`Load failed.\n\n${err.toString()}`);
    }
};

window.deleteProblem = async function (encodedProblemId, encodedProblemTitle) {
    const problemId = decodeURIComponent(encodedProblemId);
    const problemTitle = decodeURIComponent(encodedProblemTitle || "");

    const confirmed = window.confirm(
        `Delete this problem?\n\n` +
        `Problem ID: ${problemId}\n` +
        `Title: ${problemTitle}\n\n` +
        `This action cannot be undone.`
    );

    if (!confirmed) {
        return;
    }

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    statusBox.textContent = "Status: Deleting...";
    outputBox.textContent = `Deleting problem ${problemId}...`;

    try {
        const response = await fetch(`/api/problems/${encodedProblemId}`, {
            method: "DELETE"
        });

        const result = await response.json();

        if (!result.ok) {
            statusBox.textContent = "Status: Delete Failed";
            outputBox.textContent = result.message || "Delete failed.";
            notify(result.message || "Delete failed.");
            return;
        }

        if (loadedProblemId === problemId) {
            loadedProblemId = null;
            currentProblemStats = createEmptyStats();
        }

        statusBox.textContent = "Status: Deleted";
        outputBox.textContent =
            `Deleted successfully.\n` +
            `Problem ID: ${problemId}\n` +
            `Title: ${problemTitle}\n`;

        notify(
            `Problem deleted.\n\n` +
            `Problem ID: ${problemId}\n` +
            `Title: ${problemTitle}`
        );

        loadProblemList();
    } catch (err) {
        statusBox.textContent = "Status: Delete Failed";
        outputBox.textContent = err.toString();
        notify(`Delete failed.\n\n${err.toString()}`);
    }
};

window.changeTemplate = function () {
    const language = document.getElementById("language").value;
    const template = templates[language];

    setEditorContent(template, language);
    editor.focus();
};

window.resetPage = function () {
    const languageSelect = document.getElementById("language");

    languageSelect.value = defaultLanguage;
    loadedProblemId = null;
    currentProblemStats = createEmptyStats();

    setEditorContent(templates[defaultLanguage], defaultLanguage);

    document.getElementById("problemId").value = defaultProblemId;
    document.getElementById("problemTitle").value = defaultProblemTitle;
    setProblemStatement(defaultProblemStatement);

    document.getElementById("input").value = defaultInput;
    document.getElementById("answer").value = defaultAnswer;

    document.getElementById("status").textContent = "Status: Not Run";
    document.getElementById("output").textContent = "Press Run...";

    editor.focus();
};

window.saveProblem = async function () {
    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    statusBox.textContent = "Status: Saving...";
    outputBox.textContent = "Saving problem...";

    const result = await saveCurrentProblem({
        notifySuccess: true,
        notifyFailure: true,
        successMessage: "Problem saved.",
        allowRenameConfirm: true,
        silent: false
    });

    if (!result.ok) {
        statusBox.textContent = "Status: Save Failed";
        outputBox.textContent = result.message || "Save failed.";
        return;
    }

    statusBox.textContent = "Status: Saved";
    outputBox.textContent =
        `Saved successfully\n` +
        `Action: ${result.action}\n` +
        `Problem ID: ${result.problem.problemId}\n` +
        `Title: ${result.problem.problemTitle}\n` +
        `AC: ${result.problem.isAccepted ? "Yes" : "No"}\n` +
        `Attempt: ${result.problem.attemptCount || 0}\n` +
        `AC Count: ${result.problem.acceptedCount || 0}\n` +
        `Updated At: ${result.problem.updatedAt}\n`;
};

window.runCode = async function () {
    const code = editor.state.doc.toString();
    const input = document.getElementById("input").value;
    const answer = document.getElementById("answer").value;
    const language = document.getElementById("language").value;

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    statusBox.textContent = "Status: Running...";
    outputBox.textContent = "Running...";

    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                code,
                input,
                answer,
                language
            })
        });

        const result = await response.json();
        const accepted = isAcceptedStatus(result.status);
        const now = new Date().toISOString();

        currentProblemStats.attemptCount += 1;
        currentProblemStats.lastAttemptAt = now;

        if (accepted) {
            currentProblemStats.isAccepted = true;
            currentProblemStats.acceptedCount += 1;
            currentProblemStats.lastAcceptedAt = now;
        }

        const saveResult = await saveCurrentProblem({
            notifySuccess: false,
            notifyFailure: false,
            silent: true
        });

        let autoSaveMessage = "";

        if (saveResult.ok) {
            if (accepted) {
                autoSaveMessage = "Auto-save: AC and attempt saved.";

                notify(
                    `AC and saved.\n\n` +
                    `Problem ID: ${saveResult.problem.problemId}\n` +
                    `Title: ${saveResult.problem.problemTitle}\n` +
                    `Attempt: ${saveResult.problem.attemptCount || 0}\n` +
                    `AC Count: ${saveResult.problem.acceptedCount || 0}`
                );
            } else {
                autoSaveMessage = "Auto-save: attempt saved.";
            }
        } else {
            autoSaveMessage =
                `Auto-save failed/skipped: ${saveResult.message || "Unknown save error."}`;

            if (accepted) {
                notify(
                    `AC, but auto-save failed.\n\n` +
                    `${saveResult.message || "Unknown save error."}`
                );
            }
        }

        statusBox.textContent =
            `Status: ${result.status} | Time: ${result.timeMs || 0} ms`;

        let text = "";

        if (result.message) {
            text += result.message + "\n";
        }

        text += autoSaveMessage + "\n";
        text += `Attempt: ${currentProblemStats.attemptCount}\n`;
        text += `AC: ${currentProblemStats.isAccepted ? "Yes" : "No"}\n`;
        text += `AC Count: ${currentProblemStats.acceptedCount}\n`;

        if (result.stdout) {
            text += "\n===== stdout =====\n";
            text += result.stdout + "\n";
        }

        if (result.stderr) {
            text += "\n===== stderr =====\n";
            text += result.stderr + "\n";
        }

        if (!text.trim()) {
            text = "No output.";
        }

        outputBox.textContent = text;
    } catch (err) {
        statusBox.textContent = "Status: Request Failed";
        outputBox.textContent = err.toString();
    }
};

document.getElementById("problemStatement").addEventListener("input", updateMarkdownPreview);

window.addEventListener("load", () => {
    setTimeout(updateMarkdownPreview, 300);
    setTimeout(updateMarkdownPreview, 1000);
});

loadAppInfo();
loadProblemList();
updateMarkdownPreview();