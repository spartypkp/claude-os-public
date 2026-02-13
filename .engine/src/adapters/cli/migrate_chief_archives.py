#!/usr/bin/env python3
"""
One-time migration: Move logs/chief-YYYY-MM-DD/ → logs/YYYY/MM/DD/chief/

This unifies the archive structure so all work from a date lives in one location.
Safe to run multiple times (idempotent).
"""

import shutil
from pathlib import Path


def get_base_path():
    """Get repository root (4 levels up from this script)."""
    return Path(__file__).resolve().parents[4]


def migrate():
    """Migrate all chief archives to unified date structure."""

    base_path = get_base_path()
    logs_path = base_path / "Desktop" / "logs"

    if not logs_path.exists():
        print(f"❌ Logs directory doesn't exist: {logs_path}")
        return False

    # Find all chief-YYYY-MM-DD directories
    chief_dirs = sorted(logs_path.glob("chief-*"))

    if not chief_dirs:
        print("✅ No chief archives to migrate (already migrated or none exist)")
        return True

    print("=" * 70)
    print("MIGRATE CHIEF ARCHIVES")
    print("=" * 70)
    print(f"\nFound {len(chief_dirs)} chief archive(s) to migrate\n")

    migrated = 0
    skipped = 0

    for chief_dir in chief_dirs:
        # Parse date from name: chief-2026-02-12 → 2026/02/12
        date_str = chief_dir.name.replace("chief-", "")

        try:
            year, month, day = date_str.split("-")
        except ValueError:
            print(f"⚠️  Skipping {chief_dir.name} (unexpected format)")
            skipped += 1
            continue

        # Target: logs/2026/02/12/chief/
        target_date_dir = logs_path / year / month / day
        target_chief_dir = target_date_dir / "chief"

        # Check if target already exists (migration already done)
        if target_chief_dir.exists():
            print(f"⚠️  Skipping {chief_dir.name} → target already exists")
            skipped += 1
            continue

        # Count items to migrate
        items = list(chief_dir.iterdir())
        if not items:
            print(f"⚠️  Skipping {chief_dir.name} (empty)")
            chief_dir.rmdir()  # Clean up empty dir
            skipped += 1
            continue

        # Create target directory structure
        target_date_dir.mkdir(parents=True, exist_ok=True)
        target_chief_dir.mkdir(exist_ok=True)

        # Move all items from chief_dir to target
        for item in items:
            target_item = target_chief_dir / item.name

            # Safety: don't overwrite if somehow exists
            if target_item.exists():
                print(f"  ⚠️  {item.name} already exists in target, skipping")
                continue

            shutil.move(str(item), str(target_item))

        # Remove now-empty chief_dir
        chief_dir.rmdir()

        print(f"✅ Migrated: {chief_dir.name} → {year}/{month}/{day}/chief/ ({len(items)} items)")
        migrated += 1

    # Summary
    print("\n" + "=" * 70)
    print(f"✅ Migration complete")
    print("=" * 70)
    print(f"  Migrated: {migrated}")
    print(f"  Skipped:  {skipped}")
    print(f"  Total:    {len(chief_dirs)}")

    if migrated > 0:
        print(f"\n📁 All chief archives now in: logs/YYYY/MM/DD/chief/")

    return True


def verify():
    """Verify no chief-YYYY-MM-DD directories remain."""

    base_path = get_base_path()
    logs_path = base_path / "Desktop" / "logs"

    remaining = list(logs_path.glob("chief-*"))

    if remaining:
        print(f"\n⚠️  Found {len(remaining)} remaining chief-* directories:")
        for d in remaining:
            print(f"  - {d.name}")
        return False

    print("\n✅ Verification passed: No chief-* directories remain")
    return True


if __name__ == "__main__":
    try:
        success = migrate()

        if success:
            verify()

        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
