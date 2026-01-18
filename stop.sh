#!/bin/bash
#
# Claude OS Stop Script
# Run: ./stop.sh
#

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if tmux has-session -t life 2>/dev/null; then
    echo -e "${YELLOW}Stopping Claude OS...${NC}"
    tmux kill-session -t life
    echo -e "${GREEN}Claude OS stopped${NC}"
else
    echo -e "${YELLOW}Claude OS is not running${NC}"
fi
