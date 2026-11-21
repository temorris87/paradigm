"""Maps (method, path) to the function that answers it."""
from typing import Callable, Dict, Optional, Tuple

Route = Callable[..., None]


class Router:
    def __init__(self) -> None:
        self._routes: Dict[Tuple[str, str], Route] = {}

    def add(self, method: str, path: str, route: Route) -> None:
        self._routes[(method.upper(), path)] = route

    def resolve(self, method: str, path: str) -> Optional[Route]:
        return self._routes.get((method.upper(), path))

    def allows(self, path: str) -> bool:
        """True when some method is routed for this path."""
        return any(routed_path == path for _, routed_path in self._routes)
