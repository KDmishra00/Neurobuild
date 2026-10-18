#!/bin/bash
set -e

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Neurobuild GitHub Sync ===${NC}"

# Check current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Pull latest remote changes safely without conflicting with local work
echo -e "${YELLOW}Fetching latest updates from origin/$BRANCH...${NC}"
git pull --autostash --rebase origin "$BRANCH" 2>/dev/null || true

# Pre-commit safety check: verify sensitive files are not accidentally committed
if git status --porcelain | grep -qE "^\s*[AM\?].*(\.env$|\.env\.local$|\.rtf$|connection.*string)"; then
  echo -e "${RED}Security Alert: Sensitive file or connection string detected!${NC}"
  echo -e "${RED}Please check your .gitignore and unstage any credentials before syncing.${NC}"
  git status --porcelain | grep -E "(\.env|\.rtf|connection.*string)"
  exit 1
fi

# Stage all tracked and new non-ignored files
git add .

# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
  echo -e "${YELLOW}No new changes detected. Working tree clean.${NC}"
else
  # Use custom message if passed as argument, else generate a clear timestamped message
  if [ -n "$1" ]; then
    COMMIT_MSG="$1"
  else
    COMMIT_MSG="update: project updates $(date '+%Y-%m-%d %H:%M')"
  fi

  git commit -m "$COMMIT_MSG"
  echo -e "${GREEN}✓ Committed changes: ${COMMIT_MSG}${NC}"
fi

# Push to GitHub
echo -e "${YELLOW}Pushing to GitHub (origin/$BRANCH)...${NC}"
git push origin "$BRANCH"

echo -e "${GREEN}✓ Successfully updated and contributed to GitHub repository!${NC}"
