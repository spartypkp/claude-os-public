#!/bin/bash
#
# Claude OS — Get Started
#
# A local life management system powered by Claude Code.
# Clones the repo, installs dependencies, starts services,
# then launches Claude to onboard you.
#
# Usage:
#   curl -sSL <url> | bash
#
# Custom directory:
#   curl -sSL <url> | bash -s -- ~/my-claude-os
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

info() { echo -e "${BLUE}==>${NC} $1"; }
success() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}==>${NC} $1"; }
fail() { echo -e "${RED}==>${NC} $1"; exit 1; }

INSTALL_DIR="${1:-$HOME/claude-os}"

echo ""
echo -e "${BLUE}  Claude OS${NC}"
echo -e "${DIM}  Your life, managed by Claude${NC}"
echo ""

# ══════════════════════════════════════════════
# Phase 1: Prerequisites (must exist already)
# ══════════════════════════════════════════════

if [[ "$(uname)" != "Darwin" ]]; then
    fail "Claude OS requires macOS (Apple Calendar/Contacts/Mail integration)."
fi

if ! command -v git &>/dev/null; then
    fail "git is not installed. Run: xcode-select --install"
fi

if ! command -v claude &>/dev/null; then
    fail "Claude Code is not installed.\n\n  Install it with:\n    npm install -g @anthropic-ai/claude-code\n\n  Then run 'claude' once to set up your API key.\n  More info: https://docs.anthropic.com/en/docs/claude-code"
fi

# ══════════════════════════════════════════════
# Phase 2: Clone & Version Control
# ══════════════════════════════════════════════

if [ -d "$INSTALL_DIR" ]; then
    warn "Directory '${INSTALL_DIR}' already exists."
    if [ -d "$INSTALL_DIR/.git" ]; then
        echo "  Looks like a previous install. Continuing..."
    else
        fail "Not a git repo. Remove it or choose a different directory:\n  curl -sSL <url> | bash -s -- ~/other-dir"
    fi
else
    info "Cloning Claude OS..."
    git clone --quiet https://github.com/spartypkp/claude-os-public.git "$INSTALL_DIR"
    success "Cloned to ${INSTALL_DIR}/"
fi

cd "$INSTALL_DIR"

# Disconnect from public repo (mandatory — personal data will live here)
if git remote get-url origin 2>/dev/null | grep -q "claude-os-public"; then
    git remote remove origin
    success "Disconnected from public repo."
fi

# Private repo setup
echo ""
echo -e "${YELLOW}Important:${NC} Claude OS stores personal data — calendar, contacts,"
echo "memory, and notes. You should back this up to a private Git repo."
echo ""

if command -v gh &>/dev/null; then
    read -p "Create a private GitHub repo and push? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        REPO_NAME=$(basename "$INSTALL_DIR")
        if gh repo create "$REPO_NAME" --private --source=. --push 2>/dev/null; then
            success "Private repo created and pushed."
        else
            warn "Couldn't create repo automatically."
            echo "  You can do it manually later:"
            echo "    1. Create a private repo at https://github.com/new"
            echo "    2. git remote add origin git@github.com:YOUR_USERNAME/${REPO_NAME}.git"
            echo "    3. git push -u origin main"
        fi
    else
        echo "  Skipped. Claude can help you set this up later."
    fi
else
    echo "  To back up your data, create a private repo:"
    echo ""
    echo "    1. Go to https://github.com/new → name it 'claude-os' → set to PRIVATE"
    echo "    2. Run these commands:"
    echo "       cd $INSTALL_DIR"
    echo "       git remote add origin git@github.com:YOUR_USERNAME/claude-os.git"
    echo "       git push -u origin main"
    echo ""
    echo -e "  ${DIM}Tip: Install the GitHub CLI (brew install gh) and re-run to automate this.${NC}"
fi

# ══════════════════════════════════════════════
# Phase 3: System Dependencies
# ══════════════════════════════════════════════

echo ""
info "Checking system dependencies..."

# Homebrew
if ! command -v brew &>/dev/null; then
    info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon path
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    success "Homebrew found"
fi

# Python 3.11+
if ! python3 --version 2>&1 | grep -qE "3\.(1[1-9]|[2-9][0-9])"; then
    info "Installing Python 3.11..."
    brew install python@3.11
else
    success "Python $(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+') found"
fi

# Determine python command
if command -v python3.11 &>/dev/null; then
    PYTHON_CMD="python3.11"
else
    PYTHON_CMD="python3"
fi

# Node 18+
if ! command -v node &>/dev/null; then
    info "Installing Node.js..."
    brew install node
else
    NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
    if [[ "$NODE_VER" -lt 18 ]]; then
        info "Node.js too old ($NODE_VER), installing latest..."
        brew install node
    else
        success "Node.js $(node --version) found"
    fi
fi

# tmux
if ! command -v tmux &>/dev/null; then
    info "Installing tmux..."
    brew install tmux
else
    success "tmux found"
fi

# Nerd Font (for tmux theme)
if ! brew list --cask font-meslo-lg-nerd-font &>/dev/null 2>&1; then
    info "Installing Nerd Font (for tmux theme)..."
    brew install --cask font-meslo-lg-nerd-font 2>/dev/null || true
fi

# ══════════════════════════════════════════════
# Phase 4: Project Setup
# ══════════════════════════════════════════════

info "Setting up project..."

# Python virtual environment
if [[ ! -d "venv" ]]; then
    info "Creating Python virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Python dependencies
info "Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet 2>/dev/null || {
    warn "Some optional dependencies failed. Installing core deps..."
    pip install --quiet \
        fastapi uvicorn aiosqlite httpx aiohttp jinja2 \
        python-multipart "pydantic>=2.0" python-dotenv \
        sse-starlette PyYAML watchdog python-dateutil \
        mcp fastmcp 2>/dev/null || true
}

# macOS-specific integrations (Calendar, Contacts, Mail)
pip install --quiet \
    pyapple-mcp \
    pyobjc-framework-Contacts \
    pyobjc-framework-EventKit 2>/dev/null || true

success "Python dependencies installed"

# Dashboard dependencies
if [[ -d "Dashboard" ]]; then
    info "Installing Dashboard dependencies..."
    cd Dashboard
    npm install --silent 2>/dev/null || npm install
    cd ..
    success "Dashboard dependencies installed"
fi

# Config files
if [[ ! -f ".env" ]] && [[ -f ".env.example" ]]; then
    cp .env.example .env
    success "Created .env from template"
fi

if [[ ! -f ".mcp.json" ]] && [[ -f ".mcp.json.example" ]]; then
    cp .mcp.json.example .mcp.json
    success "Created .mcp.json from template"
fi

# Directories
mkdir -p .engine/data/db .engine/data/logs Desktop/conversations Desktop/logs Desktop/projects

# Database
if [[ ! -f ".engine/data/db/system.db" ]]; then
    info "Initializing database..."
    source venv/bin/activate
    $PYTHON_CMD -c "
import sqlite3, os
db_path = '.engine/data/db/system.db'
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)
schema_path = '.engine/config/schema.sql'
if os.path.exists(schema_path):
    with open(schema_path) as f:
        conn.executescript(f.read())
conn.close()
print('Database initialized')
" 2>/dev/null || warn "Database init skipped (will init on first run)"
fi

# tmux config
chmod +x .claude/tmux-status.sh 2>/dev/null || true

# ══════════════════════════════════════════════
# Phase 5: Start Services
# ══════════════════════════════════════════════

echo ""
info "Starting Claude OS services..."

# Use restart.sh if it exists, otherwise start manually
if [[ -f "./restart.sh" ]]; then
    chmod +x ./restart.sh
    ./restart.sh
else
    # Fallback: start services manually in tmux
    if ! tmux has-session -t life 2>/dev/null; then
        tmux new-session -d -s life -n backend -c "$INSTALL_DIR"
        tmux send-keys -t life:backend "source venv/bin/activate && python .engine/src/main.py" C-m
        tmux new-window -t life -n dashboard -c "$INSTALL_DIR"
        tmux send-keys -t life:dashboard "cd Dashboard && npm run dev" C-m
    fi
fi

# Wait for backend
info "Waiting for services..."
for i in $(seq 1 15); do
    if curl -s --max-time 2 http://localhost:5001/api/health >/dev/null 2>&1; then
        success "Backend ready"
        break
    fi
    [[ $i -eq 15 ]] && warn "Backend still starting (check tmux if issues)"
    sleep 1
done

# Wait for dashboard
for i in $(seq 1 20); do
    if curl -s --max-time 2 http://localhost:3000 >/dev/null 2>&1; then
        success "Dashboard ready"
        break
    fi
    [[ $i -eq 20 ]] && warn "Dashboard still building (normal for first run)"
    sleep 1
done

# Open Dashboard
open http://localhost:3000 2>/dev/null || true

# ══════════════════════════════════════════════
# Phase 6: Launch Claude for Onboarding
# ══════════════════════════════════════════════

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║        Claude OS is running!          ║"
echo "╠═══════════════════════════════════════╣"
echo "║  Dashboard:  http://localhost:3000    ║"
echo "║  Backend:    http://localhost:5001    ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo -e "${DIM}Launching Claude Code for onboarding...${NC}"
echo ""

claude "/setup"
