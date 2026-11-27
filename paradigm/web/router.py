"""Maps (method, path) to the function that answers it, and to its body cap when it has its own."""
from typing import Callable, Dict, Optional, Tuple

Route = Callable[..., None]


class Router:
    def __init__(self) -> None:
        self._routes: Dict[Tuple[str, str], Route] = {}
        self._max_bodies: Dict[Tuple[str, str], int] = {}

    def add(self, method: str, path: str, route: Route, max_body: Optional[int] = None) -> None:
        """max_body: this route's own body cap in bytes (None: the handler's default)."""
        self._routes[(method.upper(), path)] = route
        if max_body is not None:
            self._max_bodies[(method.upper(), path)] = max_body

    def max_body(self, method: str, path: str) -> Optional[int]:
        """The route's own body cap, None when it keeps the default."""
        return self._max_bodies.get((method.upper(), path))

    def resolve(self, method: str, path: str) -> Optional[Route]:
        return self._routes.get((method.upper(), path))

    def allows(self, path: str) -> bool:
        """True when some method is routed for this path."""
        return any(routed_path == path for _, routed_path in self._routes)
