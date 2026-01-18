#!/bin/bash
#
# Claude OS Starter
# Run: ./start.sh [--no-claude] [--no-browser]
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

# Parse args
NO_CLAUDE=false
NO_BROWSER=false
for arg in "$@"; do
    case $arg in
        --no-claude) NO_CLAUDE=true ;;
        --no-browser) NO_BROWSER=true ;;
        --help|-h)
            echo "Usage: ./start.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-claude    Don't start Claude Code in chief window"
            echo "  --no-browser   Don't open browser automatically"
            echo "  --help         Show this help"
            exit 0
            ;;
    esac
done

# Get script directory (handle symlinks)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║           Starting Claude OS          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check if venv exists
if [[ ! -d "venv" ]]; then
    echo -e "${RED}Error:${NC} Virtual environment not found."
    echo "Run ./install.sh first."
    exit 1
fi

# Check if already running
if tmux has-session -t life 2>/dev/null; then
    echo -e "${YELLOW}Claude OS is already running.${NC}"
    echo ""
    echo "Options:"
    echo "  • Attach to session:  tmux attach -t life"
    echo "  • Stop and restart:   ./stop.sh && ./start.sh"
    echo "  • View status:        ./status.sh"
    echo ""
    read -p "Attach to existing session? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        tmux attach -t life
    fi
    exit 0
fi

# Create tmux session
echo -e "${BLUE}==>${NC} Creating tmux session..."

# Backend window
tmux new-session -d -s life -n backend -c "$SCRIPT_DIR"
tmux send-keys -t life:backend "source venv/bin/activate && python .engine/src/main.py" C-m

# Dashboard window
tmux new-window -t life -n dashboard -c "$SCRIPT_DIR"
tmux send-keys -t life:dashboard "cd Dashboard && npm run dev" C-m

echo -e "${GREEN}==>${NC} Services starting..."
echo ""
echo -e "  ${DIM}Backend${NC}    → http://localhost:5001"
echo -e "  ${DIM}Dashboard${NC}  → http://localhost:3000"
echo ""

# Wait for services
echo -e "${BLUE}==>${NC} Waiting for services..."
sleep 2

# Check backend health
for i in {1..10}; do
    if curl -s http://localhost:5001/api/health >/dev/null 2>&1; then
        echo -e "${GREEN}==>${NC} Backend ready"
        break
    fi
    if [[ $i -eq 10 ]]; then
        echo -e "${YELLOW}==>${NC} Backend still starting (check tmux window if issues)"
    fi
    sleep 1
done

# Check dashboard
for i in {1..15}; do
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo -e "${GREEN}==>${NC} Dashboard ready"
        break
    fi
    if [[ $i -eq 15 ]]; then
        echo -e "${YELLOW}==>${NC} Dashboard still compiling (normal for first run)"
    fi
    sleep 1
done

# Spawn Chief session via API (the correct way)
if [[ "$NO_CLAUDE" == false ]] && command -v claude &>/dev/null; then
    echo -e "${BLUE}==>${NC} Starting Chief session..."
    SPAWN_RESULT=$(curl -s -X POST http://localhost:5001/api/sessions/spawn \
        -H "Content-Type: application/json" \
        -d '{"role": "chief", "mode": "interactive"}')

    if echo "$SPAWN_RESULT" | grep -q '"success":true'; then
        CHIEF_WINDOW=$(echo "$SPAWN_RESULT" | grep -o '"window_name":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}==>${NC} Chief started in window: $CHIEF_WINDOW"
    else
        echo -e "${YELLOW}==>${NC} Could not start Chief automatically"
        echo "    You can start manually: curl -X POST http://localhost:5001/api/sessions/spawn -H 'Content-Type: application/json' -d '{\"role\": \"chief\"}'"
    fi
else
    echo -e "${YELLOW}==>${NC} Claude Code not found - install with: npm install -g @anthropic-ai/claude-code"
fi

# Open browser
if [[ "$NO_BROWSER" == false ]]; then
    echo -e "${BLUE}==>${NC} Opening browser..."
    sleep 1
    open http://localhost:3000
fi

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║           Claude OS Running           ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "  Dashboard:  ${BLUE}http://localhost:3000${NC}"
echo "  Backend:    ${DIM}http://localhost:5001${NC}"
echo ""
echo "  tmux commands:"
echo "    • Attach:     tmux attach -t life"
echo "    • Detach:     Ctrl+B, then D"
echo "    • Switch:     Ctrl+B, then N (next) or P (previous)"
echo ""
echo "  Windows:"
echo "    backend    - Python API server"
echo "    dashboard  - Next.js frontend"
echo "    chief-*    - Claude Code session (Chief)"
echo ""
echo -e "  Stop:  ${YELLOW}./stop.sh${NC}"
echo ""

# Attach to session
read -p "Attach to tmux session? [Y/n] " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    tmux attach -t life
fi
