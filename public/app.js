import { basicSetup } from "https://esm.sh/codemirror";
import { EditorView, keymap } from "https://esm.sh/@codemirror/view";
import { Compartment } from "https://esm.sh/@codemirror/state";
import { cpp } from "https://esm.sh/@codemirror/lang-cpp";
import { python } from "https://esm.sh/@codemirror/lang-python";
import { indentWithTab } from "https://esm.sh/@codemirror/commands";
import { bracketMatching, indentUnit } from "https://esm.sh/@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "https://esm.sh/@codemirror/autocomplete";

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
            indentWithTab,
            ...closeBracketsKeymap
        ])
    ],
    parent: document.getElementById("editor")
});

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

function slugifyTitle(title) {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
}

function normalizeCopiedProblemText(text) {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
}

function findSectionIndex(lines, sectionName) {
    const target = sectionName.toLowerCase();

    return lines.findIndex((line) => {
        const normalized = line.trim().toLowerCase();
        return normalized === target || normalized.startsWith(target + " ");
    });
}

function cleanSectionText(text) {
    return text
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function parseNthuProblem(rawText) {
    const source = "nthu";
    const text = normalizeCopiedProblemText(rawText);

    if (!text) {
        throw new Error("No problem text provided.");
    }

    const lines = text.split("\n");
    const titleLine = lines.find((line) => line.trim().length > 0);

    if (!titleLine) {
        throw new Error("Cannot find problem title.");
    }

    const title = titleLine.trim();

    const descriptionIndex = findSectionIndex(lines, "Description");
    const inputIndex = findSectionIndex(lines, "Input");
    const constraintsIndex = findSectionIndex(lines, "Constraints");
    const outputIndex = findSectionIndex(lines, "Output");
    const sampleInputIndex = lines.findIndex((line) =>
        line.trim().toLowerCase().startsWith("sample input")
    );
    const sampleOutputIndex = lines.findIndex((line) =>
        line.trim().toLowerCase().startsWith("sample output")
    );
    const sourceIndex = findSectionIndex(lines, "Source");

    if (descriptionIndex < 0) {
        throw new Error("Cannot find Description section.");
    }

    if (inputIndex < 0) {
        throw new Error("Cannot find Input section.");
    }

    if (outputIndex < 0) {
        throw new Error("Cannot find Output section.");
    }

    const statementEndCandidates = [
        sampleInputIndex,
        sourceIndex
    ].filter((index) => index >= 0);

    const statementEnd = statementEndCandidates.length > 0
        ? Math.min(...statementEndCandidates)
        : lines.length;

    const statementLines = lines.slice(descriptionIndex, statementEnd);
    const statement = cleanSectionText(statementLines.join("\n"));

    let sampleInput = "";
    let sampleOutput = "";

    if (sampleInputIndex >= 0) {
        const inputEndCandidates = [
            sampleOutputIndex,
            sourceIndex
        ].filter((index) => index >= 0 && index > sampleInputIndex);

        const inputEnd = inputEndCandidates.length > 0
            ? Math.min(...inputEndCandidates)
            : lines.length;

        sampleInput = cleanSectionText(
            lines.slice(sampleInputIndex + 1, inputEnd).join("\n")
        );
    }

    if (sampleOutputIndex >= 0) {
        const outputEndCandidates = [
            sourceIndex
        ].filter((index) => index >= 0 && index > sampleOutputIndex);

        const outputEnd = outputEndCandidates.length > 0
            ? Math.min(...outputEndCandidates)
            : lines.length;

        sampleOutput = cleanSectionText(
            lines.slice(sampleOutputIndex + 1, outputEnd).join("\n")
        );
    }

    const titleSlug = slugifyTitle(title);
    const problemId = `${source}-${titleSlug}`;

    return {
        problemId,
        problemTitle: title,
        problemStatement: statement,
        sampleInput,
        sampleOutput,
        source,
        detectedSections: {
            descriptionIndex,
            inputIndex,
            constraintsIndex,
            outputIndex,
            sampleInputIndex,
            sampleOutputIndex,
            sourceIndex
        }
    };
}

function buildSaveNotification(result) {
    const problem = result.problem || {};
    const action = result.action || "saved";

    if (action === "created") {
        return (
            `Created new problem.\n\n` +
            `Problem ID: ${problem.problemId}\n` +
            `Title: ${problem.problemTitle}`
        );
    }

    if (action === "updated") {
        return (
            `Updated existing problem.\n\n` +
            `Problem ID: ${problem.problemId}\n` +
            `Title: ${problem.problemTitle}`
        );
    }

    if (action === "renamed") {
        return (
            `Renamed and updated problem.\n\n` +
            `Original ID: ${result.originalProblemId}\n` +
            `New ID: ${problem.problemId}\n` +
            `Title: ${problem.problemTitle}`
        );
    }

    return (
        `Problem saved.\n\n` +
        `Problem ID: ${problem.problemId || ""}\n` +
        `Title: ${problem.problemTitle || ""}`
    );
}

async function loadAppInfo() {
    const badge = document.getElementById("versionBadge");

    try {
        const response = await fetch("/api/app-info");
        const info = await response.json();

        badge.textContent = `${info.appLabel} :${info.port}`;

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

window.importProblemFromText = function () {
    const source = document.getElementById("importSource").value;
    const rawText = document.getElementById("rawProblemText").value;

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    try {
        let parsed;

        if (source === "nthu") {
            parsed = parseNthuProblem(rawText);
        } else {
            throw new Error(`Unsupported source: ${source}`);
        }

        loadedProblemId = null;

        document.getElementById("problemId").value = parsed.problemId;
        document.getElementById("problemTitle").value = parsed.problemTitle;
        document.getElementById("problemStatement").value = parsed.problemStatement;
        document.getElementById("input").value = parsed.sampleInput;
        document.getElementById("answer").value = parsed.sampleOutput;
        document.getElementById("language").value = defaultLanguage;

        editor.dispatch({
            changes: {
                from: 0,
                to: editor.state.doc.length,
                insert: ""
            },
            effects: languageMode.reconfigure(languageExtensions[defaultLanguage])
        });

        statusBox.textContent = "Status: Imported";
        outputBox.textContent =
            `Imported problem successfully.\n` +
            `Source: ${parsed.source}\n` +
            `Problem ID: ${parsed.problemId}\n` +
            `Title: ${parsed.problemTitle}\n` +
            `Sample input length: ${parsed.sampleInput.length}\n` +
            `Sample output length: ${parsed.sampleOutput.length}\n` +
            `Code editor cleared.\n`;

        closeImportModal();

        notify(
            `Imported problem.\n\n` +
            `Problem ID: ${parsed.problemId}\n` +
            `Title: ${parsed.problemTitle}\n\n` +
            `Code editor has been cleared.`
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

        if (!result.problems || result.problems.length === 0) {
            problemList.innerHTML =
                `<div class="empty-history">No saved problems yet.</div>`;
            return;
        }

        problemList.innerHTML = "";

        result.problems.forEach((problem) => {
            const item = document.createElement("div");
            item.className = "problem-item";

            const updatedAt = problem.updatedAt
                ? new Date(problem.updatedAt).toLocaleString()
                : "Unknown time";

            const encodedProblemId = encodeURIComponent(problem.problemId);

            item.innerHTML = `
                <div class="problem-info">
                    <div class="problem-name">
                        ${escapeHtml(problem.problemId)} - ${escapeHtml(problem.problemTitle)}
                    </div>
                    <div class="problem-meta-small">
                        Language: ${escapeHtml(problem.language || "cpp")} |
                        Updated: ${escapeHtml(updatedAt)}
                    </div>
                </div>

                <button onclick="loadProblem('${encodedProblemId}')">
                    Load
                </button>
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

        document.getElementById("problemId").value = problem.problemId || "";
        document.getElementById("problemTitle").value = problem.problemTitle || "";
        document.getElementById("problemStatement").value = problem.problemStatement || "";
        document.getElementById("input").value = problem.input || "";
        document.getElementById("answer").value = problem.answer || "";
        document.getElementById("language").value = language;

        editor.dispatch({
            changes: {
                from: 0,
                to: editor.state.doc.length,
                insert: problem.code || templates[language] || templates.cpp
            },
            effects: languageMode.reconfigure(
                languageExtensions[language] || languageExtensions.cpp
            )
        });

        statusBox.textContent = "Status: Problem Loaded";
        outputBox.textContent =
            `Loaded successfully\n` +
            `Problem ID: ${problem.problemId}\n` +
            `Title: ${problem.problemTitle}\n`;

        editor.focus();
    } catch (err) {
        statusBox.textContent = "Status: Load Failed";
        outputBox.textContent = err.toString();
        notify(`Load failed.\n\n${err.toString()}`);
    }
};

window.changeTemplate = function () {
    const language = document.getElementById("language").value;
    const template = templates[language];

    editor.dispatch({
        changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: template
        },
        effects: languageMode.reconfigure(languageExtensions[language])
    });

    editor.focus();
};

window.resetPage = function () {
    const languageSelect = document.getElementById("language");

    languageSelect.value = defaultLanguage;
    loadedProblemId = null;

    editor.dispatch({
        changes: {
            from: 0,
            to: editor.state.doc.length,
            insert: templates[defaultLanguage]
        },
        effects: languageMode.reconfigure(languageExtensions[defaultLanguage])
    });

    document.getElementById("problemId").value = defaultProblemId;
    document.getElementById("problemTitle").value = defaultProblemTitle;
    document.getElementById("problemStatement").value = defaultProblemStatement;

    document.getElementById("input").value = defaultInput;
    document.getElementById("answer").value = defaultAnswer;

    document.getElementById("status").textContent = "Status: Not Run";
    document.getElementById("output").textContent = "Press Run...";

    editor.focus();
};

window.saveProblem = async function () {
    const problemId = document.getElementById("problemId").value;
    const problemTitle = document.getElementById("problemTitle").value;
    const problemStatement = document.getElementById("problemStatement").value;

    const language = document.getElementById("language").value;
    const code = editor.state.doc.toString();
    const input = document.getElementById("input").value;
    const answer = document.getElementById("answer").value;

    const statusBox = document.getElementById("status");
    const outputBox = document.getElementById("output");

    if (!problemId.trim()) {
        statusBox.textContent = "Status: Save Failed";
        outputBox.textContent = "Problem ID is required.";
        notify("Save rejected.\n\nProblem ID is required.");
        return;
    }

    if (!problemTitle.trim()) {
        statusBox.textContent = "Status: Save Failed";
        outputBox.textContent = "Problem title is required.";
        notify("Save rejected.\n\nProblem title is required.");
        return;
    }

    const normalizedProblemId = problemId.trim();

    if (loadedProblemId && loadedProblemId !== normalizedProblemId) {
        const confirmed = window.confirm(
            `You loaded problem "${loadedProblemId}", but changed the Problem ID to "${normalizedProblemId}".\n\n` +
            `Saving now will rename the original problem "${loadedProblemId}" to "${normalizedProblemId}".\n\n` +
            `Do you want to continue?`
        );

        if (!confirmed) {
            statusBox.textContent = "Status: Save Cancelled";
            outputBox.textContent =
                `Save cancelled.\n` +
                `Original loaded Problem ID: ${loadedProblemId}\n` +
                `Current Problem ID: ${normalizedProblemId}\n`;
            notify("Save cancelled.");
            return;
        }
    }

    statusBox.textContent = "Status: Saving...";
    outputBox.textContent = "Saving problem...";

    try {
        const response = await fetch("/api/problems/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                originalProblemId: loadedProblemId,
                problemId,
                problemTitle,
                problemStatement,
                language,
                code,
                input,
                answer
            })
        });

        const result = await response.json();

        if (!result.ok) {
            statusBox.textContent = "Status: Save Failed";
            outputBox.textContent = result.message || "Save failed.";
            notify(`Save rejected.\n\n${result.message || "Save failed."}`);
            return;
        }

        loadedProblemId = result.problem.problemId;

        statusBox.textContent = "Status: Saved";
        outputBox.textContent =
            `Saved successfully\n` +
            `Action: ${result.action}\n` +
            `Problem ID: ${result.problem.problemId}\n` +
            `Title: ${result.problem.problemTitle}\n` +
            `Updated At: ${result.problem.updatedAt}\n`;

        notify(buildSaveNotification(result));
        loadProblemList();
    } catch (err) {
        statusBox.textContent = "Status: Save Failed";
        outputBox.textContent = err.toString();
        notify(`Save failed.\n\n${err.toString()}`);
    }
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

        statusBox.textContent =
            `Status: ${result.status} | Time: ${result.timeMs || 0} ms`;

        let text = "";

        if (result.message) {
            text += result.message + "\n";
        }

        if (result.stdout) {
            text += "===== stdout =====\n";
            text += result.stdout + "\n";
        }

        if (result.stderr) {
            text += "===== stderr =====\n";
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

loadAppInfo();
loadProblemList();