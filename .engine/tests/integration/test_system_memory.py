"""Integration tests for system memory endpoint."""


def test_system_memory_parses_sections(client, tmp_path, monkeypatch):
    from core import config as config_module
    from modules.system import api as system_api

    repo_root = tmp_path / "repo"
    desktop = repo_root / "Desktop"
    desktop.mkdir(parents=True)

    (desktop / "TODAY.md").write_text(
        "# Today\n\n## Memory\nfoo\n\n## Friction\nbar\n\n## Open Loops\nbaz\n",
        encoding="utf-8",
    )
    (desktop / "MEMORY.md").write_text(
        "# Memory\n\n## Current State\nstate\n\n## Active Threads\nthreads\n\n## Stable Patterns\npatterns\n",
        encoding="utf-8",
    )

    original_repo_root = config_module.settings.repo_root
    original_api_root = system_api.REPO_ROOT
    monkeypatch.setattr(config_module.settings, "repo_root", repo_root)
    monkeypatch.setattr(system_api, "REPO_ROOT", repo_root)
    try:
        response = client.get("/api/system/memory")
    finally:
        monkeypatch.setattr(system_api, "REPO_ROOT", original_api_root)
        monkeypatch.setattr(config_module.settings, "repo_root", original_repo_root)

    assert response.status_code == 200
    payload = response.json()
    assert payload["today"]["memory_section"] == "foo"
    assert payload["today"]["friction_section"] == "bar"
    assert payload["today"]["open_loops"] == "baz"
    assert "patterns" in payload["longterm"]["content"]
