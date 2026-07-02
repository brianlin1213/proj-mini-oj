export function slugifyTitle(title) {
    return title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
}

export function normalizeText(text) {
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

function parseFrontmatter(markdown) {
    const text = normalizeText(markdown);

    if (!text.startsWith("---\n")) {
        return {
            meta: {},
            body: text
        };
    }

    const endIndex = text.indexOf("\n---", 4);

    if (endIndex < 0) {
        return {
            meta: {},
            body: text
        };
    }

    const rawMeta = text.slice(4, endIndex).trim();
    const body = text.slice(endIndex + 4).trim();
    const meta = {};

    rawMeta.split("\n").forEach((line) => {
        const colonIndex = line.indexOf(":");

        if (colonIndex < 0) {
            return;
        }

        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        value = value.replace(/^["']/, "").replace(/["']$/, "");

        if (key) {
            meta[key] = value;
        }
    });

    return {
        meta,
        body
    };
}

function findFirstHeading(body) {
    const match = body.match(/^#\s+(.+)$/m);

    if (!match) {
        return "";
    }

    return match[1].trim();
}

function findMarkdownHeadingIndex(lines, headingPrefix) {
    const pattern = new RegExp(`^#{2,6}\\s+${headingPrefix}\\b`, "i");

    return lines.findIndex((line) => pattern.test(line.trim()));
}

function findNextMarkdownHeadingIndex(lines, startIndex) {
    for (let i = startIndex + 1; i < lines.length; i++) {
        if (/^#{1,6}\s+/.test(lines[i].trim())) {
            return i;
        }
    }

    return lines.length;
}

function extractFirstFence(text) {
    const fenceMatch = text.match(/(?:^|\n)\s*(```|~~~)[^\n]*\n([\s\S]*?)\n\s*\1/);

    if (!fenceMatch) {
        return "";
    }

    return fenceMatch[2].trim();
}

function stripLooseFenceLines(text) {
    return text
        .split("\n")
        .filter((line) => {
            const trimmed = line.trim();
            return !trimmed.startsWith("```") && !trimmed.startsWith("~~~");
        })
        .join("\n")
        .trim();
}

function extractMarkdownSample(lines, headingIndex) {
    if (headingIndex < 0) {
        return "";
    }

    const endIndex = findNextMarkdownHeadingIndex(lines, headingIndex);
    const sectionText = lines.slice(headingIndex + 1, endIndex).join("\n").trim();

    const fenced = extractFirstFence(sectionText);

    if (fenced) {
        return fenced;
    }

    return stripLooseFenceLines(sectionText);
}

function removeMarkdownSampleSections(body) {
    const lines = body.split("\n");
    const output = [];

    let i = 0;

    while (i < lines.length) {
        const current = lines[i].trim();

        if (/^#{2,6}\s+Sample Input\b/i.test(current) ||
            /^#{2,6}\s+Sample Output\b/i.test(current)) {
            i = findNextMarkdownHeadingIndex(lines, i);
            continue;
        }

        output.push(lines[i]);
        i++;
    }

    return cleanSectionText(output.join("\n"));
}

export function parseMarkdownProblem(rawText) {
    const text = normalizeText(rawText);

    if (!text) {
        throw new Error("No Markdown text provided.");
    }

    const { meta, body } = parseFrontmatter(text);

    const title =
        meta.title ||
        findFirstHeading(body);

    if (!title) {
        throw new Error("Cannot find title. Please provide frontmatter title or a # heading.");
    }

    const source = meta.source || "markdown";
    const language = meta.language || "cpp";

    const id =
        meta.id ||
        `${source}-${slugifyTitle(title)}`;

    const lines = body.split("\n");

    const sampleInputIndex = findMarkdownHeadingIndex(lines, "Sample Input");
    const sampleOutputIndex = findMarkdownHeadingIndex(lines, "Sample Output");

    const sampleInput = extractMarkdownSample(lines, sampleInputIndex);
    const sampleOutput = extractMarkdownSample(lines, sampleOutputIndex);

    const problemStatement = removeMarkdownSampleSections(body);

    return {
        problemId: id,
        problemTitle: title,
        problemStatement,
        sampleInput,
        sampleOutput,
        source,
        language,
        code: ""
    };
}

export function parseNthuProblem(rawText) {
    const source = "nthu";
    const text = normalizeText(rawText);

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
        language: "cpp",
        code: "",
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