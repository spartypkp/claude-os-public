#!/usr/bin/env python3
"""
Archive yesterday and reset for today.

Archives everything to logs by default. Memory consolidation then restores
what should remain active. This inverts the traditional cleanup problem:
instead of deciding what to delete, you decide what to keep.

What it archives:
1. Desktop/TODAY.md → Desktop/logs/YYYY/MM/DD/daily.md
2. Desktop/conversations/ → Desktop/logs/YYYY/MM/DD/working/
3. Desktop/sessions/ → Desktop/logs/YYYY/MM/DD/sessions/

What it creates:
- Fresh Desktop/TODAY.md from template
- Empty Desktop/conversations/ and Desktop/sessions/ directories

Usage:
    python reset_day.py                    # Archive yesterday
    python reset_day.py 2026-01-06         # Archive specific date
"""

import sys
import shutil
from datetime import datetime, timedelta
from pathlib import Path

from today_template import get_today_template

# Base paths - from .engine/src/adapters/cli/, go up 4 levels to repo root
BASE_PATH = Path(__file__).resolve().parents[4]
DESKTOP_PATH = BASE_PATH / "Desktop"


def parse_date_arg():
    """Parse date from command line argument or default to yesterday."""
    if len(sys.argv) > 1:
        try:
            return datetime.strptime(sys.argv[1], "%Y-%m-%d")
        except ValueError:
            print(f"❌ Invalid date format: {sys.argv[1]}")
            print("   Expected: YYYY-MM-DD")
            sys.exit(1)
    else:
        # Default to yesterday
        return datetime.now() - timedelta(days=1)


def ensure_archive_dir(archive_date):
    """Create archive directory structure for the given date.

    Returns: Path to archive directory (Desktop/logs/YYYY/MM/DD/)
    """
    archive_dir = DESKTOP_PATH / "logs" / archive_date.strftime("%Y/%m/%d")
    archive_dir.mkdir(parents=True, exist_ok=True)
    return archive_dir


def archive_today_md(archive_dir):
    """Archive Desktop/TODAY.md to logs.

    Renames TODAY.md → daily.md, then moves to archive.
    Returns number of files archived.
    """
    today_file = DESKTOP_PATH / "TODAY.md"
    daily_file = DESKTOP_PATH / "daily.md"

    if not today_file.exists():
        print("⚠️  Desktop/TODAY.md doesn't exist - skipping")
        return 0

    # Rename TODAY.md → daily.md first
    if daily_file.exists():
        daily_file.unlink()
    today_file.rename(daily_file)

    # Move to archive
    archive_file = archive_dir / "daily.md"
    shutil.move(str(daily_file), str(archive_file))
    print(f"✅ Archived: TODAY.md → {archive_file.relative_to(BASE_PATH)}")
    return 1


def archive_directory(source_name, archive_dir):
    """Archive a directory from Desktop/ to logs.

    Args:
        source_name: Name of directory in Desktop/ (e.g., "sessions")
        archive_dir: Target archive directory

    Returns: Number of items archived
    """
    source_dir = DESKTOP_PATH / source_name
    target_dir = archive_dir / source_name

    if not source_dir.exists():
        print(f"⚠️  {source_dir.relative_to(BASE_PATH)} doesn't exist - skipping")
        return 0

    # Count items before archiving
    items = list(source_dir.iterdir())
    if not items:
        print(f"⚠️  {source_dir.relative_to(BASE_PATH)} is empty - skipping")
        return 0

    # Move directory to archive
    if target_dir.exists():
        shutil.rmtree(target_dir)
    shutil.move(str(source_dir), str(target_dir))

    # Recreate empty source directory
    source_dir.mkdir(exist_ok=True)

    print(f"✅ Archived: {len(items)} items from {source_name}/ → {target_dir.relative_to(BASE_PATH)}")
    return len(items)


def archive_conversations(archive_dir):
    """Archive Desktop/conversations/ with special handling for chief/.

    - chief/ folder persists (stable location), only contents archived
    - chief/ contents go to logs/chief-YYYY-MM-DD/
    - Other specialist folders go to logs/YYYY/MM/DD/conversations/

    Returns: Number of items archived
    """
    conversations_dir = DESKTOP_PATH / "conversations"

    if not conversations_dir.exists():
        print(f"⚠️  Desktop/conversations/ doesn't exist - skipping")
        return 0

    total_archived = 0

    # Handle chief/ separately
    chief_dir = conversations_dir / "chief"
    if chief_dir.exists():
        chief_items = list(chief_dir.iterdir())
        if chief_items:
            # Archive chief contents to logs/chief-YYYY-MM-DD/
            date_str = archive_dir.name  # DD from YYYY/MM/DD
            parent_str = archive_dir.parent.name  # MM
            grandparent_str = archive_dir.parent.parent.name  # YYYY
            chief_archive = DESKTOP_PATH / "logs" / f"chief-{grandparent_str}-{parent_str}-{date_str}"
            chief_archive.mkdir(parents=True, exist_ok=True)

            for item in chief_items:
                target = chief_archive / item.name
                if target.exists():
                    if target.is_dir():
                        shutil.rmtree(target)
                    else:
                        target.unlink()
                shutil.move(str(item), str(target))
                total_archived += 1

            print(f"✅ Archived: {len(chief_items)} items from chief/ → {chief_archive.relative_to(BASE_PATH)}")

    # Handle other items in conversations/
    target_dir = archive_dir / "conversations"
    other_items = [item for item in conversations_dir.iterdir() if item.name != "chief"]

    if other_items:
        target_dir.mkdir(parents=True, exist_ok=True)

        for item in other_items:
            target = target_dir / item.name
            if target.exists():
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
            shutil.move(str(item), str(target))
            total_archived += 1

        print(f"✅ Archived: {len(other_items)} items from conversations/ → {target_dir.relative_to(BASE_PATH)}")

    # Ensure chief/ folder exists (even if it was empty or didn't exist)
    chief_dir.mkdir(exist_ok=True)

    return total_archived


def create_today_file():
    """Create fresh Desktop/TODAY.md from template."""
    date = datetime.now()

    # Use centralized template
    template = get_today_template(date)

    today_file = DESKTOP_PATH / "TODAY.md"
    with open(today_file, 'w') as f:
        f.write(template)

    print(f"✅ Created: fresh TODAY.md for {date.strftime('%A, %B %d, %Y')}")


def main():
    """Main workflow: archive everything, create fresh TODAY.md."""

    # Parse date to archive
    archive_date = parse_date_arg()
    today_date = datetime.now()

    print("=" * 70)
    print("RESET DAY - Archive & Reset")
    print("=" * 70)
    print(f"\n📅 Archiving: {archive_date.strftime('%B %d, %Y')}")
    print(f"📅 Creating fresh files for: {today_date.strftime('%B %d, %Y')}")

    # Create archive directory
    print(f"\n📁 Creating archive directory...")
    archive_dir = ensure_archive_dir(archive_date)
    print(f"✅ Archive at: {archive_dir.relative_to(BASE_PATH)}")

    # Archive everything
    print(f"\n📦 Archiving files...")
    total_archived = 0
    total_archived += archive_today_md(archive_dir)
    total_archived += archive_conversations(archive_dir)
    total_archived += archive_directory("sessions", archive_dir)

    # Create fresh TODAY.md
    print(f"\n📝 Creating fresh TODAY.md...")
    create_today_file()

    # Summary
    print("\n" + "=" * 70)
    print(f"✅ Reset complete - {total_archived} items archived")
    print("=" * 70)
    print(f"\nArchived to: {archive_dir.relative_to(BASE_PATH)}")
    print("\nNext steps:")
    print("  1. Review archived daily.md for active items")
    print("  2. Restore needed files from logs/YYYY/MM/DD/working/")
    print("  3. Update TODAY.md with active tracking/bugs/friction")
    print("  4. Update MEMORY.md (promote patterns, clear stale items)")

    return True


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
