"""App discovery and loading for Core OS.

Discovers all apps (Core and Custom) by scanning:
- .engine/src/apps/*/     - Core Apps
- .engine/src/custom/*/   - Custom Apps (if matching Desktop/*/APP-SPEC.md exists)

Each app folder must have an __init__.py that exports a `plugin` instance.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path
from typing import List, Optional

from config import settings

# Add src to path for imports
SRC_DIR = settings.engine_dir / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def discover_apps() -> List["AppPlugin"]:
    """Find all apps (Core and Custom).
    
    Returns:
        List of AppPlugin instances ready to be loaded
    """
    from core import AppPlugin
    
    apps: List[AppPlugin] = []
    
    # Core Apps: .engine/src/apps/*/
    apps_dir = SRC_DIR / "apps"
    if apps_dir.exists():
        for folder in sorted(apps_dir.iterdir()):
            if folder.is_dir() and (folder / "__init__.py").exists():
                # Skip __pycache__
                if folder.name.startswith("_"):
                    continue
                    
                try:
                    module = importlib.import_module(f"apps.{folder.name}")
                    if hasattr(module, 'plugin'):
                        plugin = module.plugin
                        if isinstance(plugin, AppPlugin):
                            apps.append(plugin)
                        else:
                            print(f"Warning: apps/{folder.name}/plugin is not an AppPlugin")
                except ImportError as e:
                    print(f"Failed to load app {folder.name}: {e}")
                except Exception as e:
                    print(f"Error loading app {folder.name}: {e}")
    
    # Custom Apps: .engine/src/custom/*/
    # Only load if matching Desktop/*/APP-SPEC.md exists
    custom_dir = SRC_DIR / "custom"
    desktop_dir = settings.repo_root / "Desktop"
    
    if custom_dir.exists():
        for folder in sorted(custom_dir.iterdir()):
            if folder.is_dir() and (folder / "__init__.py").exists():
                # Skip __pycache__
                if folder.name.startswith("_"):
                    continue
                
                # Convert slug: my_app -> my-app
                desktop_name = folder.name.replace("_", "-")
                app_spec = desktop_dir / desktop_name / "APP-SPEC.md"
                
                if not app_spec.exists():
                    print(f"Skipping custom/{folder.name}: No Desktop/{desktop_name}/APP-SPEC.md")
                    continue
                
                try:
                    module = importlib.import_module(f"custom.{folder.name}")
                    if hasattr(module, 'plugin'):
                        plugin = module.plugin
                        if isinstance(plugin, AppPlugin):
                            apps.append(plugin)
                        else:
                            print(f"Warning: custom/{folder.name}/plugin is not an AppPlugin")
                except ImportError as e:
                    print(f"Failed to load custom app {folder.name}: {e}")
                except Exception as e:
                    print(f"Error loading custom app {folder.name}: {e}")
    
    return apps


def load_app_by_slug(slug: str) -> Optional["AppPlugin"]:
    """Load a specific app by slug.
    
    Args:
        slug: App slug (e.g., "contacts", "job-search")
        
    Returns:
        AppPlugin instance or None if not found
    """
    from core import AppPlugin
    
    # Try Core Apps first
    apps_dir = SRC_DIR / "apps"
    folder_name = slug.replace("-", "_")
    app_folder = apps_dir / folder_name
    
    if app_folder.exists() and (app_folder / "__init__.py").exists():
        try:
            module = importlib.import_module(f"apps.{folder_name}")
            if hasattr(module, 'plugin'):
                plugin = module.plugin
                if isinstance(plugin, AppPlugin):
                    return plugin
        except Exception as e:
            print(f"Failed to load app {slug}: {e}")
    
    # Try Custom Apps
    custom_dir = SRC_DIR / "custom"
    custom_folder = custom_dir / folder_name
    
    if custom_folder.exists() and (custom_folder / "__init__.py").exists():
        # Verify Desktop spec exists
        desktop_name = slug  # Already in kebab-case
        desktop_dir = settings.repo_root / "Desktop"
        app_spec = desktop_dir / desktop_name / "APP-SPEC.md"
        
        if app_spec.exists():
            try:
                module = importlib.import_module(f"custom.{folder_name}")
                if hasattr(module, 'plugin'):
                    plugin = module.plugin
                    if isinstance(plugin, AppPlugin):
                        return plugin
            except Exception as e:
                print(f"Failed to load custom app {slug}: {e}")
    
    return None


def reload_app(slug: str) -> Optional["AppPlugin"]:
    """Reload an app (useful for development).
    
    Args:
        slug: App slug
        
    Returns:
        Reloaded AppPlugin instance or None
    """
    import importlib
    
    folder_name = slug.replace("-", "_")
    
    # Try reloading from apps/
    try:
        module_name = f"apps.{folder_name}"
        if module_name in sys.modules:
            module = sys.modules[module_name]
            importlib.reload(module)
            if hasattr(module, 'plugin'):
                return module.plugin
    except Exception:
        pass
    
    # Try reloading from custom/
    try:
        module_name = f"custom.{folder_name}"
        if module_name in sys.modules:
            module = sys.modules[module_name]
            importlib.reload(module)
            if hasattr(module, 'plugin'):
                return module.plugin
    except Exception:
        pass
    
    return load_app_by_slug(slug)

