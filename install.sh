#!/bin/bash
#
# Claude OS Installer
# Run: ./install.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}==>${NC} $1"; }
success() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}==>${NC} $1"; }
error() { echo -e "${RED}==>${NC} $1"; exit 1; }

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║         Claude OS Installer           ║"
echo "║     Your life, managed by Claude      ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
    error "Claude OS requires macOS (for Apple Calendar/Contacts/Mail integration)"
fi

# Check macOS version
macos_version=$(sw_vers -productVersion | cut -d. -f1)
if [[ "$macos_version" -lt 12 ]]; then
    error "Claude OS requires macOS 12 (Monterey) or later. You have $(sw_vers -productVersion)"
fi

success "macOS $(sw_vers -productVersion) detected"

# Check/install Homebrew
if ! command -v brew &>/dev/null; then
    info "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add to path for Apple Silicon
    if [[ -f "/opt/homebrew/bin/brew" ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    success "Homebrew found"
fi

# Install Python if needed
if ! command -v python3.11 &>/dev/null && ! python3 --version 2>&1 | grep -q "3.1[1-9]"; then
    info "Installing Python 3.11..."
    brew install python@3.11
else
    success "Python 3.11+ found"
fi

# Determine python command
if command -v python3.11 &>/dev/null; then
    PYTHON_CMD="python3.11"
elif python3 --version 2>&1 | grep -q "3.1[1-9]"; then
    PYTHON_CMD="python3"
else
    error "Could not find Python 3.11+. Please install it manually."
fi

# Install Node if needed
if ! command -v node &>/dev/null; then
    info "Installing Node.js..."
    brew install node
else
    node_version=$(node --version | cut -d. -f1 | tr -d 'v')
    if [[ "$node_version" -lt 18 ]]; then
        warn "Node.js $node_version found, but 18+ recommended. Installing latest..."
        brew install node
    else
        success "Node.js $(node --version) found"
    fi
fi

# Install tmux if needed
if ! command -v tmux &>/dev/null; then
    info "Installing tmux..."
    brew install tmux
else
    success "tmux found"
fi

# Check for Claude Code
if ! command -v claude &>/dev/null; then
    warn "Claude Code CLI not found."
    echo ""
    echo "    Install it with: npm install -g @anthropic-ai/claude-code"
    echo "    Then run 'claude' once to set up your API key."
    echo ""
    read -p "    Continue anyway? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    success "Claude Code CLI found"
fi

# Setup Python virtual environment
if [[ ! -d "venv" ]]; then
    info "Creating Python virtual environment..."
    $PYTHON_CMD -m venv venv
else
    success "Virtual environment exists"
fi

# Activate and install Python deps
info "Installing Python dependencies..."
source venv/bin/activate

pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

success "Python dependencies installed"

# Setup Node dependencies
if [[ -d "Dashboard" ]]; then
    info "Installing Dashboard dependencies..."
    cd Dashboard
    npm install --silent 2>/dev/null || npm install
    cd ..
    success "Dashboard dependencies installed"
else
    warn "Dashboard/ directory not found, skipping Node setup"
fi

# Create config files from examples
info "Setting up configuration files..."

if [[ ! -f ".env" ]] && [[ -f ".env.example" ]]; then
    cp .env.example .env
    success "Created .env from template"
else
    success ".env exists"
fi

if [[ ! -f ".mcp.json" ]] && [[ -f ".mcp.json.example" ]]; then
    cp .mcp.json.example .mcp.json
    success "Created .mcp.json from template"
else
    success ".mcp.json exists"
fi

# Create data directories
mkdir -p .engine/data/db
mkdir -p Desktop/working
mkdir -p Desktop/logs
mkdir -p Desktop/projects

# Verify core Desktop files exist
if [[ -f "Desktop/TODAY.md" ]] && [[ -f "Desktop/MEMORY.md" ]] && [[ -f "Desktop/IDENTITY.md" ]]; then
    success "Desktop files present"
else
    warn "Some Desktop files missing (TODAY.md, MEMORY.md, IDENTITY.md)"
fi

# Initialize database if needed
if [[ ! -f ".engine/data/db/system.db" ]]; then
    info "Initializing database..."
    source venv/bin/activate
    $PYTHON_CMD -c "
import sqlite3
import os
from datetime import datetime

db_path = '.engine/data/db/system.db'
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)

# Run schema if exists
schema_path = '.engine/config/schema.sql'
if os.path.exists(schema_path):
    with open(schema_path) as f:
        conn.executescript(f.read())

# Seed default data
now = datetime.now().isoformat()

# Default triggers (morning brief, evening checkin, calendar reminders)
conn.executescript('''
INSERT OR IGNORE INTO triggers (type, time_spec, enabled) VALUES
    ('scheduled', '08:00', 1),
    ('scheduled', '21:00', 1),
    ('calendar', '15', 1);

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('wake_interval_minutes', '15', datetime('now'));
''')

# Default chief duties (memory consolidation, morning prep)
conn.execute('''
INSERT OR IGNORE INTO chief_duties (id, slug, name, description, schedule_time, prompt_file, timeout_minutes, enabled, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
''', ('duty-memory-consolidation', 'memory-consolidation', 'Memory Consolidation',
      'Archive yesterday, consolidate MEMORY.md, process friction, git commit',
      '06:00', '.claude/scheduled/memory-consolidation.md', 45, 1, now, now))

conn.execute('''
INSERT OR IGNORE INTO chief_duties (id, slug, name, description, schedule_time, prompt_file, timeout_minutes, enabled, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
''', ('duty-morning-prep', 'morning-prep', 'Morning Prep',
      'Create morning brief and prepare fresh Chief for the day',
      '07:00', '.claude/scheduled/morning-prep.md', 30, 1, now, now))

conn.commit()
conn.close()
print('Database initialized with seed data')
" 2>/dev/null || warn "Database initialization skipped (will init on first run)"
fi

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║       Installation Complete!          ║"
echo "╚═══════════════════════════════════════╝"
echo ""
success "Claude OS is ready to run"
echo ""
echo "Next steps:"
echo ""
echo "  1. Start Claude OS:"
echo "     ${GREEN}./start.sh${NC}"
echo ""
echo "  2. Open Dashboard:"
echo "     ${BLUE}http://localhost:3000${NC}"
echo ""
echo "  3. Grant permissions when prompted:"
echo "     • Calendar (System Settings → Privacy → Calendars)"
echo "     • Contacts (System Settings → Privacy → Contacts)"
echo "     • Full Disk Access for Mail (System Settings → Privacy → Full Disk Access)"
echo ""
if ! command -v claude &>/dev/null; then
    echo "  4. Install Claude Code CLI:"
    echo "     ${YELLOW}npm install -g @anthropic-ai/claude-code${NC}"
    echo ""
fi
