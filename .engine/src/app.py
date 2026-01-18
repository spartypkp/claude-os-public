"""FastAPI application with lifespan-managed background services.

This is the main entry point for the Life Engine backend.
It uses the new App Plugin architecture while maintaining backwards
compatibility with existing API routes.

Architecture:
    Core (core/__init__.py) - The OS core
    Apps (apps/*) - Core Applications (contacts, priorities, etc.)
    Custom (custom/*) - Custom Applications (job-search, etc.)
    
See Workspace/specs/app-architecture.md for the full architecture.
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("engine")

# Initialize Core
from core import Core
from core.loader import discover_apps

core = Core()


def load_apps():
    """Discover and load all apps into the Core.
    
    This runs at import time to register all app routes and services.
    """
    apps = discover_apps()
    
    for plugin in apps:
        try:
            logger.info(f"Loading app: {plugin.manifest.name}")
            core.load_app(plugin)
            
            # Install if first time
            core.install_app(plugin)
            
        except Exception as e:
            logger.error(f"Failed to load app {plugin.manifest.name}: {e}")
    
    logger.info(f"Loaded {len(core.get_apps())} apps")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - start/stop background services."""
    logger.info("Starting engine...")

    stop_event = asyncio.Event()
    app.state.stop_event = stop_event
    app.state.core = core  # Expose core to routes if needed

    # Run account discovery on startup
    try:
        from services.account_discovery import AccountDiscoveryService
        from services.storage import SystemStorage
        from config import settings

        storage = SystemStorage(settings.db_path)
        discovery_service = AccountDiscoveryService(storage)
        stats = discovery_service.run_discovery()
        logger.info(f"Account discovery complete: {stats}")
    except Exception as e:
        logger.error(f"Account discovery failed: {e}")

    # Import background loops (lazy to avoid circular imports)
    from loops.watcher import start_watcher
    from loops.scheduler import start_scheduler
    from loops.duty_scheduler import start_duty_scheduler
    # NOTE: Orphan cleanup disabled (Jan 2026) - fights against eternal conversation model
    # Sessions are now identified by conversation_id, not session_id. Individual sessions
    # becoming "stale" is expected behavior, not an error to clean up.
    # from loops.cleanup import start_cleanup
    from loops.email_queue import start_email_queue
    from loops.context_monitor import get_monitor
    from services.triggers import start_trigger_service

    # Start background tasks
    watcher_task = asyncio.create_task(start_watcher(stop_event), name="watcher")
    # executor_task removed - worker system migrated to Claude Code subagents (Jan 2026)
    scheduler_task = asyncio.create_task(start_scheduler(stop_event), name="mission_scheduler")
    duty_scheduler_task = asyncio.create_task(start_duty_scheduler(stop_event), name="duty_scheduler")
    # cleanup_task disabled - see note above
    email_queue_task = asyncio.create_task(start_email_queue(stop_event), name="email_queue")
    trigger_task = asyncio.create_task(start_trigger_service(stop_event, settings.db_path), name="trigger_service")

    # Start context monitor
    context_monitor = get_monitor(settings.db_path)
    monitor_task = asyncio.create_task(context_monitor.start(), name="context_monitor")

    # Start usage tracker
    from services.usage_tracker import UsageTracker
    from services.storage import SystemStorage
    from api.usage import set_tracker

    storage = SystemStorage(settings.db_path)
    usage_tracker = UsageTracker(storage, poll_interval=600)  # 10 minutes
    await usage_tracker.start()
    set_tracker(usage_tracker)  # Make available to API

    # Start Telegram service
    from services.telegram import TelegramService
    telegram_service = TelegramService()
    await telegram_service.start()
    app.state.telegram_service = telegram_service

    app.state.watcher_task = watcher_task
    # app.state.executor_task removed - worker system migrated to Claude Code subagents (Jan 2026)
    app.state.scheduler_task = scheduler_task
    app.state.duty_scheduler_task = duty_scheduler_task
    # app.state.cleanup_task - disabled
    app.state.email_queue_task = email_queue_task
    app.state.monitor_task = monitor_task
    app.state.usage_tracker = usage_tracker
    app.state.trigger_task = trigger_task

    logger.info("Background loops started (missions + duties schedulers, context monitor, usage tracker, trigger service)")

    yield

    # Shutdown
    logger.info("Shutting down...")
    stop_event.set()

    # Stop context monitor gracefully
    context_monitor.stop()

    # Stop usage tracker gracefully
    await usage_tracker.stop()

    # Stop Telegram service gracefully
    await telegram_service.stop()

    all_tasks = [watcher_task, scheduler_task, duty_scheduler_task, email_queue_task, monitor_task, trigger_task]
    try:
        await asyncio.wait_for(
            asyncio.gather(*all_tasks, return_exceptions=True),
            timeout=30.0
        )
        logger.info("Background loops stopped")
    except asyncio.TimeoutError:
        logger.warning("Shutdown timeout - force cancelling")
        for task in all_tasks:
            task.cancel()
        await asyncio.gather(*all_tasks, return_exceptions=True)


# Create FastAPI app
app = FastAPI(
    title="Life Engine",
    description="Claude OS Backend - filesystem monitoring, task execution, and dashboard API",
    version="4.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect Core to our app (so app routes are mounted here)
core._api = app


@app.get("/api/health")
async def health():
    """Basic health check."""
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/health/detailed")
async def health_detailed():
    """Detailed health check including background services and loaded apps."""
    result = {
        "api": {"status": "running"},
        "watcher": {"status": "unknown"},
        "executor": {"status": "unknown"},
        "apps": {slug: {"name": p.manifest.name} for slug, p in core.get_apps().items()},
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    for name in ["watcher", "executor", "scheduler", "duty_scheduler", "cleanup"]:
        task = getattr(app.state, f"{name}_task", None)
        if task:
            if task.done():
                result[name] = {"status": "stopped"}
                if task.exception():
                    result[name]["error"] = str(task.exception())
            else:
                result[name] = {"status": "running"}

    return result


# =============================================================================
# LEGACY ROUTES (backwards compatibility)
# These will be migrated to apps/ over time
# =============================================================================

from api import (
    tasks, files, context, pings, system,
    chief, sessions, metrics, health, claude,
    events, accounts, usage
)

# System routes
app.include_router(sessions.router, prefix="/api/system/sessions", tags=["sessions"])
app.include_router(metrics.router, prefix="/api/system/metrics", tags=["metrics"])
app.include_router(health.router, prefix="/api/system/health", tags=["health"])
app.include_router(claude.router, prefix="/api/system/claude", tags=["claude"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])

# Feature routes
app.include_router(tasks.router, prefix="/api/workers", tags=["workers"])
app.include_router(pings.router, prefix="/api/pings", tags=["pings"])
app.include_router(chief.router, prefix="/api/chief", tags=["chief"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(context.router, prefix="/api/context", tags=["context"])
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(usage.router, tags=["usage"])


# =============================================================================
# APP PLUGIN ROUTES
# Load and mount app routes via Core
# =============================================================================

# Load all apps (this discovers and registers them with Core)
# Core was connected to our app above, so routes are mounted on `app`
load_apps()
