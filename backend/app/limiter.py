from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter instance — imported by main.py (middleware) and routers (decorators)
limiter = Limiter(key_func=get_remote_address, default_limits=["300/minute"])
