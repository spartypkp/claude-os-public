"""Integration tests for system endpoints."""


def test_system_health(client):
    response = client.get("/api/system/health")
    assert response.status_code == 200


def test_system_perf_includes_workers(client):
    client.get("/api/health")
    response = client.get("/api/system/perf")
    assert response.status_code == 200
    payload = response.json()
    assert "workers" in payload
