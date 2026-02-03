"""Grafana HTTP API client."""

import os
from typing import Any, Dict, List, Optional

import httpx


class GrafanaError(Exception):
    """Error communicating with Grafana API."""

    pass


class GrafanaClient:
    """Client for Grafana HTTP API."""

    def __init__(
        self,
        url: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        """
        Initialize the Grafana client.

        Args:
            url: Grafana URL (defaults to GRAFANA_URL env var)
            user: Username (defaults to GRAFANA_USER env var)
            password: Password (defaults to GRAFANA_PASSWORD env var)
        """
        self.url = (url or os.getenv("GRAFANA_URL", "http://localhost:3000")).rstrip("/")
        self.user = user or os.getenv("GRAFANA_USER", "admin")
        self.password = password or os.getenv("GRAFANA_PASSWORD", "admin")

        self._client = httpx.Client(
            base_url=self.url,
            auth=(self.user, self.password),
            timeout=30.0,
        )

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def health_check(self) -> bool:
        """Check if Grafana is healthy."""
        try:
            response = self._client.get("/api/health")
            return response.status_code == 200
        except Exception:
            return False

    def create_dashboard(
        self,
        dashboard: Dict[str, Any],
        folder_id: int = 0,
        overwrite: bool = True,
    ) -> Dict[str, Any]:
        """
        Create or update a dashboard.

        Args:
            dashboard: Dashboard JSON
            folder_id: Folder ID to save in (0 = General)
            overwrite: Whether to overwrite existing dashboard with same UID

        Returns:
            Response with dashboard URL and metadata
        """
        payload = {
            "dashboard": dashboard,
            "folderId": folder_id,
            "overwrite": overwrite,
        }

        try:
            response = self._client.post("/api/dashboards/db", json=payload)

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "uid": data.get("uid"),
                    "url": f"{self.url}{data.get('url', '')}",
                    "id": data.get("id"),
                    "version": data.get("version"),
                }
            else:
                return {
                    "success": False,
                    "error": response.text,
                    "status_code": response.status_code,
                }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }

    def get_dashboard(self, uid: str) -> Optional[Dict[str, Any]]:
        """Get a dashboard by UID."""
        try:
            response = self._client.get(f"/api/dashboards/uid/{uid}")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None

    def delete_dashboard(self, uid: str) -> bool:
        """Delete a dashboard by UID."""
        try:
            response = self._client.delete(f"/api/dashboards/uid/{uid}")
            return response.status_code == 200
        except Exception:
            return False

    def list_dashboards(self, query: str = "") -> List[Dict[str, Any]]:
        """List dashboards, optionally filtered by query."""
        try:
            params = {"query": query} if query else {}
            response = self._client.get("/api/search", params=params)
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []

    def get_datasources(self) -> List[Dict[str, Any]]:
        """List all datasources."""
        try:
            response = self._client.get("/api/datasources")
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []

    def create_datasource(self, datasource: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new datasource."""
        try:
            response = self._client.post("/api/datasources", json=datasource)
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            return {"success": False, "error": response.text}
        except Exception as e:
            return {"success": False, "error": str(e)}


class AsyncGrafanaClient:
    """Async client for Grafana HTTP API."""

    def __init__(
        self,
        url: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        """Initialize the async Grafana client."""
        self.url = (url or os.getenv("GRAFANA_URL", "http://localhost:3000")).rstrip("/")
        self.user = user or os.getenv("GRAFANA_USER", "admin")
        self.password = password or os.getenv("GRAFANA_PASSWORD", "admin")

        self._client = httpx.AsyncClient(
            base_url=self.url,
            auth=(self.user, self.password),
            timeout=30.0,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()

    async def health_check(self) -> bool:
        """Check if Grafana is healthy."""
        try:
            response = await self._client.get("/api/health")
            return response.status_code == 200
        except Exception:
            return False

    async def create_dashboard(
        self,
        dashboard: Dict[str, Any],
        folder_id: int = 0,
        overwrite: bool = True,
    ) -> Dict[str, Any]:
        """Create or update a dashboard."""
        payload = {
            "dashboard": dashboard,
            "folderId": folder_id,
            "overwrite": overwrite,
        }

        try:
            response = await self._client.post("/api/dashboards/db", json=payload)

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "uid": data.get("uid"),
                    "url": f"{self.url}{data.get('url', '')}",
                    "id": data.get("id"),
                    "version": data.get("version"),
                }
            else:
                return {
                    "success": False,
                    "error": response.text,
                    "status_code": response.status_code,
                }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }

    async def get_dashboard(self, uid: str) -> Optional[Dict[str, Any]]:
        """Get a dashboard by UID."""
        try:
            response = await self._client.get(f"/api/dashboards/uid/{uid}")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None

    async def delete_dashboard(self, uid: str) -> bool:
        """Delete a dashboard by UID."""
        try:
            response = await self._client.delete(f"/api/dashboards/uid/{uid}")
            return response.status_code == 200
        except Exception:
            return False

    async def list_dashboards(self, query: str = "") -> List[Dict[str, Any]]:
        """List dashboards."""
        try:
            params = {"query": query} if query else {}
            response = await self._client.get("/api/search", params=params)
            if response.status_code == 200:
                return response.json()
            return []
        except Exception:
            return []
