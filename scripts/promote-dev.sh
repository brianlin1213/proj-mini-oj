#!/usr/bin/env bash
set -euo pipefail

DEV_DIR="${MINIOJ_DEV_DIR:-$HOME/mini-oj-dev}"
MAIN_DIR="${MINIOJ_MAIN_DIR:-$HOME/mini-oj}"
DEV_BRANCH="${MINIOJ_DEV_BRANCH:-dev}"
MAIN_BRANCH="${MINIOJ_MAIN_BRANCH:-main}"

COMMIT_MESSAGE=""
RESTART_SERVICE=0
SERVICE_NAME="${MINIOJ_SERVICE_NAME:-mini-oj}"

usage() {
    cat << EOF
Usage:
  scripts/promote-dev.sh -m "commit message"
  scripts/promote-dev.sh --restart -m "commit message"
  scripts/promote-dev.sh

Options:
  -m, --message     Commit message for dirty dev worktree.
  --restart         Restart systemd service after merge.
  -h, --help        Show help.

Environment variables:
  MINIOJ_DEV_DIR       Default: \$HOME/mini-oj-dev
  MINIOJ_MAIN_DIR      Default: \$HOME/mini-oj
  MINIOJ_DEV_BRANCH    Default: dev
  MINIOJ_MAIN_BRANCH   Default: main
  MINIOJ_SERVICE_NAME  Default: mini-oj
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -m|--message)
            if [[ $# -lt 2 ]]; then
                echo "[ERROR] Missing commit message after $1"
                exit 1
            fi
            COMMIT_MESSAGE="$2"
            shift 2
            ;;
        --restart)
            RESTART_SERVICE=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "[ERROR] Unknown argument: $1"
            usage
            exit 1
            ;;
    esac
done

fail() {
    echo "[ERROR] $1"
    exit 1
}

check_git_dir() {
    local dir="$1"

    if [[ ! -d "$dir" ]]; then
        fail "Directory not found: $dir"
    fi

    if ! git -C "$dir" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
        fail "Not a git worktree: $dir"
    fi
}

current_branch() {
    git -C "$1" branch --show-current
}

is_dirty() {
    [[ -n "$(git -C "$1" status --porcelain)" ]]
}

common_git_dir() {
    (
        cd "$1"
        realpath "$(git rev-parse --git-common-dir)"
    )
}

echo "==== Mini OJ promote dev to main ===="
echo "DEV_DIR:       $DEV_DIR"
echo "MAIN_DIR:      $MAIN_DIR"
echo "DEV_BRANCH:    $DEV_BRANCH"
echo "MAIN_BRANCH:   $MAIN_BRANCH"
echo "RESTART:       $RESTART_SERVICE"
echo

check_git_dir "$DEV_DIR"
check_git_dir "$MAIN_DIR"

DEV_COMMON="$(common_git_dir "$DEV_DIR")"
MAIN_COMMON="$(common_git_dir "$MAIN_DIR")"

if [[ "$DEV_COMMON" != "$MAIN_COMMON" ]]; then
    fail "DEV_DIR and MAIN_DIR are not worktrees of the same repository."
fi

DEV_CURRENT="$(current_branch "$DEV_DIR")"
MAIN_CURRENT="$(current_branch "$MAIN_DIR")"

if [[ "$DEV_CURRENT" != "$DEV_BRANCH" ]]; then
    fail "$DEV_DIR is on branch '$DEV_CURRENT', expected '$DEV_BRANCH'."
fi

if [[ "$MAIN_CURRENT" != "$MAIN_BRANCH" ]]; then
    fail "$MAIN_DIR is on branch '$MAIN_CURRENT', expected '$MAIN_BRANCH'."
fi

echo "Checking dev worktree..."
if is_dirty "$DEV_DIR"; then
    echo "Dev worktree has changes."

    if [[ -z "$COMMIT_MESSAGE" ]]; then
        echo
        echo "Please commit first or provide a commit message:"
        echo "  scripts/promote-dev.sh -m \"Your commit message\""
        echo
        git -C "$DEV_DIR" status --short
        exit 1
    fi

    echo "Committing dev changes..."
    git -C "$DEV_DIR" add -A
    git -C "$DEV_DIR" commit -m "$COMMIT_MESSAGE"
else
    echo "Dev worktree is clean."
fi

echo
echo "Checking main worktree..."
if is_dirty "$MAIN_DIR"; then
    echo
    git -C "$MAIN_DIR" status --short
    fail "Main worktree is dirty. Please clean or commit changes in $MAIN_DIR first."
fi

echo "Main worktree is clean."

echo
echo "Merging $DEV_BRANCH into $MAIN_BRANCH..."
MAIN_BEFORE="$(git -C "$MAIN_DIR" rev-parse HEAD)"

if ! git -C "$MAIN_DIR" merge --no-ff "$DEV_BRANCH" -m "Merge $DEV_BRANCH into $MAIN_BRANCH"; then
    echo
    echo "[MERGE CONFLICT]"
    echo "Resolve conflicts in:"
    echo "  $MAIN_DIR"
    echo
    echo "Then run:"
    echo "  cd $MAIN_DIR"
    echo "  git status"
    echo "  git add <fixed files>"
    echo "  git commit"
    echo
    echo "After that, sync dev manually:"
    echo "  cd $DEV_DIR"
    echo "  git merge --ff-only $MAIN_BRANCH"
    exit 1
fi

MAIN_AFTER="$(git -C "$MAIN_DIR" rev-parse HEAD)"

echo
echo "Merge completed."
echo "Main before: $MAIN_BEFORE"
echo "Main after:  $MAIN_AFTER"

echo
echo "Checking package changes..."
CHANGED_FILES="$(git -C "$MAIN_DIR" diff --name-only "$MAIN_BEFORE" "$MAIN_AFTER" || true)"

if echo "$CHANGED_FILES" | grep -Eq '(^|/)package.json$|(^|/)package-lock.json$'; then
    echo "package.json or package-lock.json changed. Running npm install..."
    npm --prefix "$MAIN_DIR" install
else
    echo "No package change detected."
fi

echo
echo "Fast-forwarding dev branch to main..."
git -C "$DEV_DIR" merge --ff-only "$MAIN_BRANCH"

if [[ "$RESTART_SERVICE" -eq 1 ]]; then
    echo
    echo "Restarting systemd service: $SERVICE_NAME"
    sudo systemctl restart "$SERVICE_NAME"
    sudo systemctl status "$SERVICE_NAME" --no-pager
else
    echo
    echo "Service not restarted."
    echo "If your release service is running by systemd, restart manually with:"
    echo "  sudo systemctl restart $SERVICE_NAME"
fi

echo
echo "Done."
echo "Release main is now updated."