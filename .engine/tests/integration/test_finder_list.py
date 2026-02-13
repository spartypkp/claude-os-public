"""Integration tests for Finder list endpoint."""


def test_finder_list_root(client, tmp_path, monkeypatch):
    from core import config as config_module
    from modules.finder import api as finder_api

    original_repo_root = config_module.settings.repo_root
    test_root = tmp_path / "repo"
    desktop_root = test_root / "Desktop"
    desktop_root.mkdir(parents=True)
    (desktop_root / "hello.txt").write_text("hello", encoding="utf-8")

    monkeypatch.setattr(config_module.settings, "repo_root", test_root)
    finder_api._finder_service = None
    try:
        response = client.get("/api/files/list")
    finally:
        finder_api._finder_service = None
        monkeypatch.setattr(config_module.settings, "repo_root", original_repo_root)

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("path") == "/"
    assert isinstance(payload.get("items"), list)


def test_finder_read_file(client, tmp_path, monkeypatch):
    from core import config as config_module
    from modules.finder import api as finder_api

    original_repo_root = config_module.settings.repo_root
    test_root = tmp_path / "repo"
    desktop_root = test_root / "Desktop"
    desktop_root.mkdir(parents=True)
    (desktop_root / "note.txt").write_text("hello", encoding="utf-8")

    monkeypatch.setattr(config_module.settings, "repo_root", test_root)
    finder_api._finder_service = None
    try:
        response = client.get("/api/files/read/note.txt")
    finally:
        finder_api._finder_service = None
        monkeypatch.setattr(config_module.settings, "repo_root", original_repo_root)

    assert response.status_code == 200
    payload = response.json()
    assert payload.get("content") == "hello"
