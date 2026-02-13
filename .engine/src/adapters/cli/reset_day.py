#!/usr/bin/env python3
"""
Archive yesterday and reset for today.

Archives everything to logs by default. Memory consolidation then restores
what should remain active. This inverts the traditional cleanup problem:
instead of deciding what to delete, you decide what to keep.

What it archives:
1. Desktop/TODAY.md → Desktop/logs/YYYY/MM/DD/daily.md
2. Desktop/conversations/chief/* → Desktop/logs/YYYY/MM/DD/chief/
3. Desktop/conversations/* → Desktop/logs/YYYY/MM/DD/conversations/

What it creates:
- Fresh Desktop/TODAY.md from template
- Empty Desktop/conversations/ directory (chief/ subfolder persists)

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


def check_already_archived(archive_dir):
    """Check if archive already exists (idempotency check).

    Returns: True if already archived (abort), False if safe to proceed
    """
    daily_file = archive_dir / "daily.md"

    if daily_file.exists():
        print(f"❌ Archive already exists for this date")
        print(f"   {daily_file.relative_to(BASE_PATH)} already exists")
        print(f"\n   Aborting to prevent data loss.")
        print(f"   If you need to re-run, manually delete the archive first:")
        print(f"   rm -rf {archive_dir.relative_to(BASE_PATH)}")
        return True

    return False


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


def archive_conversations(archive_dir):
    """Archive Desktop/conversations/ with unified date structure.

    - chief/ contents go to logs/YYYY/MM/DD/chief/
    - Other items go to logs/YYYY/MM/DD/conversations/

    Both use the same date hierarchy (unified structure).

    Returns: Number of items archived
    """
    conversations_dir = DESKTOP_PATH / "conversations"

    if not conversations_dir.exists():
        print(f"⚠️  Desktop/conversations/ doesn't exist - skipping")
        return 0

    total_archived = 0

    # Handle chief/ separately (but in unified structure)
    chief_dir = conversations_dir / "chief"
    if chief_dir.exists():
        chief_items = list(chief_dir.iterdir())
        if chief_items:
            # Archive chief contents to logs/YYYY/MM/DD/chief/
            target_chief = archive_dir / "chief"
            target_chief.mkdir(parents=True, exist_ok=True)

            for item in chief_items:
                target = target_chief / item.name
                if target.exists():
                    if target.is_dir():
                        shutil.rmtree(target)
                    else:
                        target.unlink()
                shutil.move(str(item), str(target))
                total_archived += 1

            print(f"✅ Archived: {len(chief_items)} items from chief/ → {target_chief.relative_to(BASE_PATH)}")

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

    # Idempotency check
    print(f"\n🔍 Checking if already archived...")
    if check_already_archived(archive_dir):
        return False

    # Archive everything
    print(f"\n📦 Archiving files...")
    total_archived = 0
    total_archived += archive_today_md(archive_dir)
    total_archived += archive_conversations(archive_dir)

    # Create fresh TODAY.md
    print(f"\n📝 Creating fresh TODAY.md...")
    create_today_file()

    # Summary
    print("\n" + "=" * 70)
    print(f"✅ Reset complete - {total_archived} items archived")
    print("=" * 70)
    print(f"\nArchived to: {archive_dir.relative_to(BASE_PATH)}")
    print("\nNext steps:")
    print("  1. Spawn Curator for memory consolidation")
    print("  2. Curator extracts knowledge from archived daily.md")
    print("  3. Curator updates MEMORY.md and TODAY.md")
    print("  4. Chief writes morning brief")

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
