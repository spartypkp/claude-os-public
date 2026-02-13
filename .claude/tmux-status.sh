#!/bin/bash
# Claude OS tmux status bar — health check + context usage + time

TERRA="#da7756"
BG="#1a1a1a"
BG_ALT="#252320"
GREEN="#7ec699"
AMBER="#e8c170"
RED="#e87070"
MUTED="#6b6560"
FG="#e8e4df"
SEP_RIGHT=""

get_health() {
    if curl -s --max-time 1 http://localhost:5001/api/health > /dev/null 2>&1; then
        echo "#[fg=$GREEN]󰸞#[fg=$FG]"
    else
        echo "#[fg=$RED]󰸟#[fg=$FG]"
    fi
}

get_context() {
    if [ -d /tmp/claude-status ]; then
        LATEST=$(ls -t /tmp/claude-status/*.txt 2>/dev/null | head -1)
        if [ -n "$LATEST" ] && [ -f "$LATEST" ]; then
            if [ $(find "$LATEST" -mmin -0.5 2>/dev/null | wc -l) -gt 0 ]; then
                DATA=$(cat "$LATEST")
                PERCENT=$(echo "$DATA" | cut -d'|' -f1)
                if [ "$PERCENT" -lt 50 ]; then
                    CTX_COLOR=$GREEN
                elif [ "$PERCENT" -lt 80 ]; then
                    CTX_COLOR=$AMBER
                else
                    CTX_COLOR=$RED
                fi
                echo "#[fg=$CTX_COLOR]󰊤 ${PERCENT}%#[fg=$FG]"
                return
            fi
        fi
    fi
    echo ""
}

HEALTH=$(get_health)
CONTEXT=$(get_context)
TIME=$(date +"%H:%M")

OUTPUT="${HEALTH}  "
if [ -n "$CONTEXT" ]; then
    OUTPUT="${OUTPUT}${CONTEXT}  "
fi
OUTPUT="${OUTPUT}#[fg=$BG_ALT]${SEP_RIGHT}#[bg=$BG_ALT,fg=$MUTED] 󰥔 ${TIME} #[bg=$BG,fg=$BG_ALT]${SEP_RIGHT}#[default]"

echo "$OUTPUT"
