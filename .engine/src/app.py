"""FastAPI application with lifespan-managed background services.

Main entry point for the Life Engine backend.
"""
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import PlainTextResponse

from core.config import settings
from core.perf import record_route_latency

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger("engine")


def _build_lifespan(testing: bool):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """Manage application lifecycle - start/stop background services."""
        logger.info("Starting engine...")

        stop_event = asyncio.Event()
        app.state.stop_event = stop_event

        if not testing:
            # Run account discovery on startup
            try:
                from modules.accounts.discovery import AccountDiscoveryService
                from core.storage import SystemStorage

                storage = SystemStorage(settings.db_path)
                discovery_service = AccountDiscoveryService(storage)
                stats = discovery_service.run_discovery()
                logger.info(f"Account discovery complete: {stats}")
            except Exception as e:
                logger.error(f"Account discovery failed: {e}")

            # Import background workers (lazy to avoid circular imports)
            from workers.watcher import start_watcher
            from workers.context_monitor import get_monitor
            from workers.today_sync import start_today_sync
            from core.scheduler import start_scheduler

            # Start background tasks
            watcher_task = asyncio.create_task(start_watcher(stop_event), name="watcher")
            scheduler_task = asyncio.create_task(start_scheduler(stop_event), name="scheduler")
            today_sync_task = asyncio.create_task(start_today_sync(stop_event), name="today_sync")

            # Start context monitor
            context_monitor = get_monitor(settings.db_path)
            monitor_task = asyncio.create_task(context_monitor.start(), name="context_monitor")

            # Usage tracker — polls /usage via temp tmux windows every 10 min
            from modules.analytics.usage_tracker import UsageTracker
            from modules.analytics.api import set_tracker
            usage_storage = SystemStorage(settings.db_path)
            usage_tracker = UsageTracker(usage_storage, poll_interval=600)
            await usage_tracker.start()
            set_tracker(usage_tracker)

            # Start Telegram service
            from adapters.telegram import TelegramService
            telegram_service = TelegramService()
            await telegram_service.start()
            app.state.telegram_service = telegram_service

            app.state.watcher_task = watcher_task
            app.state.scheduler_task = scheduler_task
            app.state.monitor_task = monitor_task
            app.state.usage_tracker = usage_tracker
            app.state.today_sync_task = today_sync_task

            logger.info("Background services started")

            yield

            # Shutdown
            logger.info("Shutting down...")
            stop_event.set()

            # Stop context monitor gracefully
            context_monitor.stop()

            # Stop usage tracker gracefully
            if usage_tracker:
                await usage_tracker.stop()

            # Stop Telegram service gracefully
            await telegram_service.stop()

            all_tasks = [watcher_task, scheduler_task, monitor_task, today_sync_task]
            try:
                await asyncio.wait_for(
                    asyncio.gather(*all_tasks, return_exceptions=True),
                    timeout=30.0
                )
                logger.info("Background services stopped")
            except asyncio.TimeoutError:
                logger.warning("Shutdown timeout - force cancelling")
                for task in all_tasks:
                    task.cancel()
                await asyncio.gather(*all_tasks, return_exceptions=True)
        else:
            logger.info("Testing mode - background services disabled")
            yield

    return lifespan


def create_app(testing: bool = False, db_path: Path | None = None) -> FastAPI:
    """Create FastAPI app instance (testing-safe)."""
    app = FastAPI(
        title="Life Engine",
        description="Claude OS Backend",
        version="5.0.0",
        lifespan=_build_lifespan(testing)
    )
    app.state.testing = testing

    @app.middleware("http")
    async def log_slow_requests(request, call_next):
        """Log slow requests and collect latency stats."""
        start = time.perf_counter()
        try:
            response = await call_next(request)
            errored = response.status_code >= 500
        except Exception:
            errored = True
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            route = request.scope.get("route")
            route_path = getattr(route, "path", request.url.path)
            route_key = f"{request.method} {route_path}"
            record_route_latency(route_key, elapsed_ms, errored)
            if elapsed_ms >= 500:
                logger.warning(f"Slow request {request.method} {request.url.path} - {elapsed_ms:.1f}ms")
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Ensure unhandled exceptions still return CORS headers.

        FastAPI's ServerErrorMiddleware sits outside CORSMiddleware, so
        unhandled 500s lose CORS headers. This handler catches them first
        and includes the headers so the browser shows the real error.
        """
        response = PlainTextResponse("Internal Server Error", status_code=500)
        origin = request.headers.get("origin")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
        logger.exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
        return response

    # =============================================================================
    # HEALTH ENDPOINTS
    # =============================================================================

    @app.get("/api/health")
    async def health():
        """Basic health check (liveness probe). For detailed info use /api/system/health."""
        return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

    # =============================================================================
    # MODULE ROUTES
    # All routes follow pattern: /api/{module}
    # =============================================================================

    from modules.sessions import api as sessions_api
    from modules.analytics import api as analytics_api
    from modules.accounts import api as accounts_api
    from modules.calendar import api as calendar_api
    from modules.contacts import api as contacts_api
    from modules.email import api as email_api
    from modules.priorities import api as priorities_api
    from modules.duties import api as duties_api
    from modules.messages import api as messages_api
    from modules.roles import api as roles_api
    from modules.settings import api as settings_api
    from modules.finder import api as finder_api
    from modules.system import api as system_api
    from modules.schedule import api as schedule_api

    # Core system
    app.include_router(sessions_api.router, prefix="/api/sessions")
    app.include_router(system_api.router, prefix="/api/system")
    app.include_router(analytics_api.router, prefix="/api/analytics")
    app.include_router(accounts_api.router, prefix="/api/accounts")
    app.include_router(settings_api.router, prefix="/api/settings")

    # Life domains
    app.include_router(calendar_api.router, prefix="/api/calendar")
    app.include_router(contacts_api.router, prefix="/api/contacts")
    app.include_router(email_api.router, prefix="/api/email")
    app.include_router(priorities_api.router, prefix="/api/priorities")
    app.include_router(messages_api.router, prefix="/api/messages")

    # Features
    app.include_router(finder_api.router, prefix="/api/files")
    app.include_router(duties_api.router, prefix="/api/duties")
    app.include_router(roles_api.router, prefix="/api/roles")
    # Schedule
    app.include_router(schedule_api.router, prefix="/api/schedule")

    # Custom apps
    # Add your custom app routers here:
    # from modules.my_app import api as my_app_api
    # app.include_router(my_app_api.router, prefix="/api/my-app")
    from modules.reading_list import api as reading_list_api
    app.include_router(reading_list_api.router, prefix="/api/reading-list")

    return app


# Create FastAPI app
app = create_app()
