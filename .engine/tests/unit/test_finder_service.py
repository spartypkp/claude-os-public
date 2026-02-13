"""Unit tests for FinderService edge cases."""

from pathlib import Path
import pytest

from modules.finder.service import FinderService


def test_resolve_path_blocks_escape(tmp_path, monkeypatch):
    from core import config as config_module

    repo_root = tmp_path / "repo"
    desktop = repo_root / "Desktop"
    desktop.mkdir(parents=True)

    monkeypatch.setattr(config_module.settings, "repo_root", repo_root)
    service = FinderService()

    with pytest.raises(ValueError):
        service._resolve_path("../secrets.txt")


def test_read_file_rejects_binary(tmp_path, monkeypatch):
    from core import config as config_module

    repo_root = tmp_path / "repo"
    desktop = repo_root / "Desktop"
    desktop.mkdir(parents=True)
    (desktop / "blob.bin").write_bytes(b"\xff\xfe\x00\x00")

    monkeypatch.setattr(config_module.settings, "repo_root", repo_root)
    service = FinderService()

    with pytest.raises(ValueError):
        service.read_file("blob.bin")
