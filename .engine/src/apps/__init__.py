"""Core Applications for Claude OS.

Core Apps ship with the system and provide fundamental functionality.
Each app is a self-contained module following the AppPlugin pattern.

Apps:
- contacts: Contact management (database-backed)
- priorities: Priority/task management
- (future) calendar: Calendar integration
- (future) finder: File browser

See Workspace/specs/app-architecture.md for the architecture.
"""

# Apps are discovered automatically via core.loader.discover_apps()
# This __init__.py just marks the directory as a Python package

