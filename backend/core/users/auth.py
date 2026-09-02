"""
Setu JWT Authentication

generate_tokens() — creates access + refresh token pair for a user.
PyJWTAuthentication — DRF authentication class used on all protected endpoints.

Token lifetimes are configured in settings.SIMPLE_JWT.
"""

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from rest_framework import authentication, exceptions

from .models import RefreshToken, User

logger = logging.getLogger('core.users')


def generate_tokens(user, device_info=None) -> dict:
    """
    Issue a new access + refresh token pair for the given user.

    Args:
        user:        A MongoEngine User document instance.
        device_info: Optional user-agent string for refresh token tracking.

    Returns:
        Dict with access_token, refresh_token, and expires_in (seconds).
    """
    now            = datetime.now(timezone.utc)
    access_expiry  = now + timedelta(minutes=15)
    refresh_expiry = now + timedelta(days=7)

    access_token = jwt.encode(
        {'user_id': user.user_id, 'exp': access_expiry, 'type': 'access'},
        settings.SECRET_KEY,
        algorithm='HS256'
    )

    refresh_jti   = str(uuid.uuid4())
    refresh_token = jwt.encode(
        {'user_id': user.user_id, 'jti': refresh_jti, 'exp': refresh_expiry, 'type': 'refresh'},
        settings.SECRET_KEY,
        algorithm='HS256'
    )

    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    RefreshToken(
        token_hash=token_hash,
        user_id=user.user_id,
        issued_at=now,
        expires_at=refresh_expiry,
        device_info=device_info
    ).save()

    return {
        'access_token':  access_token,
        'refresh_token': refresh_token,
        'expires_in':    900,  # 15 minutes in seconds
    }


class PyJWTAuthentication(authentication.BaseAuthentication):
    """
    Custom DRF authentication class that validates Bearer JWT tokens.

    Used on all Setu REST endpoints via:
        authentication_classes = [PyJWTAuthentication]
    """

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None  # No token — let DRF permission classes handle it

        token = auth_header.split(' ')[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
            if payload.get('type') != 'access':
                raise exceptions.AuthenticationFailed('Invalid token type.')

            user = User.objects(user_id=payload['user_id']).first()
            if not user or not user.is_active:
                logger.warning("Auth failed: user not found or inactive (user_id=%s)", payload['user_id'])
                raise exceptions.AuthenticationFailed('User not found or inactive.')

            # MongoEngine User is not a Django auth.User — attach is_authenticated manually
            user.is_authenticated = True
            return (user, token)

        except jwt.ExpiredSignatureError:
            logger.debug("Auth failed: token expired")
            raise exceptions.AuthenticationFailed('Token has expired.')
        except jwt.InvalidTokenError as e:
            logger.debug("Auth failed: invalid token — %s", e)
            raise exceptions.AuthenticationFailed('Invalid token.')

from allauth.account.adapter import DefaultAccountAdapter


class NoNewUsersAccountAdapter(DefaultAccountAdapter):
    """
    Adapter that prevents standard local (password) signups.
    Only allows OAuth signups via SocialAccountAdapter.
    """
    def is_open_for_signup(self, request):
        return False
