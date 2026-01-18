#!/usr/bin/env python3
"""Entry point for running the backend server."""
import argparse
import os
import sys
from pathlib import Path

# Set up paths - main.py is at .engine/src/main.py
src_dir = Path(__file__).resolve().parent
project_root = src_dir.parents[1]

sys.path.insert(0, str(src_dir))
sys.path.insert(0, str(project_root))
os.chdir(project_root)

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv(project_root / ".env")

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Life System Backend Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=5001, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()

    uvicorn.run(
        "app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
