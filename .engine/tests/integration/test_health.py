"""Integration tests for core health and perf endpoints."""


def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"


def test_perf_endpoint_collects_routes(client):
    client.get("/api/health")
    response = client.get("/api/system/perf")
    assert response.status_code == 200
    payload = response.json()
    routes = payload.get("routes", {})
    assert "GET /api/health" in routes
