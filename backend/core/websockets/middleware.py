"""
Setu WebSocket Authentication Middleware

Validates the JWT access token passed as a query parameter:
  ws://localhost:8000/ws/stream/<conversation_id>/?token=<access_jwt>

Injects a User instance (or None) into the ASGI scope before the consumer runs.
Unauthorized consumers are closed with code 4001.
"""

import logging
from urllib.parse import parse_qs

import jwt
from asgiref.sync import sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings

from core.users.models import User

logger = logging.getLogger('core.websockets')


@sync_to_async
def get_user_from_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "access":
            logger.warning("WS auth rejected: token is not access type")
            return None

        user = User.objects(user_id=payload['user_id']).first()
        if user and user.is_active:
            logger.debug("WS auth success: user=%s", user.username)
            return user

        logger.warning("WS auth failed: user not found or inactive (user_id=%s)", payload.get('user_id'))
        return None

    except jwt.ExpiredSignatureError:
        logger.warning("WS auth failed: token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning("WS auth failed: invalid token — %s", e)
        return None
    except Exception as e:
        logger.error("WS auth unexpected error: %s", e)
        return None


class JwtAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        token = None

        # 1. Try to extract token from standard HTTP Cookie header
        from django.http import SimpleCookie
        headers = dict(scope.get("headers", []))
        cookie_header = headers.get(b"cookie", b"").decode("utf-8")
        if cookie_header:
            cookie = SimpleCookie(cookie_header)
            if "setu-auth" in cookie:
                token = cookie["setu-auth"].value

        # 2. Extract token from subprotocols (Secure cross-origin standard)
        if not token:
            subprotocols = scope.get("subprotocols", [])
            for sub in subprotocols:
                if sub.startswith("access_token,"):
                    token = sub.split(",")[1]
                    break
                # Standard frontend WebSocket subprotocol array often joins as string or passes as list
                elif sub == "access_token":
                    # The next subprotocol might be the token itself depending on ASGI server implementation
                    idx = subprotocols.index(sub)
                    if len(subprotocols) > idx + 1:
                        token = subprotocols[idx+1]
                        break

        # 3. Fallback to query parameter (backwards compatibility / dev testing)
        if not token:
            query_string = scope.get("query_string", b"").decode("utf-8")
            query_params = parse_qs(query_string)
            token = query_params.get("token", [None])[0]

        scope["user"] = None
        if token:
            scope["user"] = await get_user_from_token(token)

        return await super().__call__(scope, receive, send)
