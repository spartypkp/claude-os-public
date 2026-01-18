from typing import Callable, Dict

from .contacts import ContactsModule
from .domains import DomainsModule
from .life_md import LifeMdModule
from .today_context import TodayContextModule


FEATURE_REGISTRY: Dict[str, Callable[[], object]] = {
    "domains": DomainsModule,  # Deprecated - use life_md instead
    "life_md": LifeMdModule,   # Generates all SYSTEM-INDEX.md sections
    "contacts": ContactsModule,
    "today_context": TodayContextModule,
}
