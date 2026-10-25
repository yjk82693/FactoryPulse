"""JWT verification and server-owned membership resolution; never trust tenant claims."""
import os
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Request
from backend.common import fail


def disabled():
    return os.getenv('AUTH_DISABLED', '').lower() == 'true'


def validate_config():
    if disabled():
        if os.getenv('APP_ENV', 'development').lower() not in ('development', 'local', 'test'):
            raise RuntimeError('AUTH_DISABLED is allowed only in local development')
    elif not os.getenv('AUTH0_DOMAIN') or not os.getenv('AUTH0_AUDIENCE'):
        raise RuntimeError('AUTH0_DOMAIN and AUTH0_AUDIENCE are required')


@lru_cache(maxsize=4)
def jwks(domain):
    return jwt.PyJWKClient(f'https://{domain}/.well-known/jwks.json', timeout=5)


@dataclass(frozen=True)
class Identity:
    user: dict
    company: dict
    role: str


def authenticate(token, repository):
    if disabled():
        return Identity(dict(id='dev-user', name='Dev User', email=None),
                        dict(id='demo-co', name='Demo Manufacturing'), 'supervisor')
    try:
        domain = os.environ['AUTH0_DOMAIN']
        signing_key = jwks(domain).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, signing_key.key, algorithms=['RS256'],
                            audience=os.environ['AUTH0_AUDIENCE'], issuer=f'https://{domain}/',
                            options={'require': ['exp', 'iss', 'aud', 'sub']})
        if not isinstance(claims['sub'], str) or not claims['sub']:
            raise jwt.InvalidTokenError('Invalid subject')
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        fail(401, 'unauthenticated', 'Invalid or expired access token')
    member = repository.identity(claims['sub'], os.getenv('DEMO_AUTO_JOIN', '').lower() == 'true')
    if member is None:
        fail(403, 'forbidden', 'No company membership')
    return Identity(**member)


def current(request: Request):
    header = request.headers.get('authorization', '')
    scheme, _, token = header.partition(' ')
    if not disabled() and (scheme.lower() != 'bearer' or not token):
        fail(401, 'unauthenticated', 'Bearer token required')
    identity = authenticate(token, request.app.state.repository)
    request.state.identity = identity
    return identity


def supervisor(request: Request):
    identity = current(request)
    if identity.role != 'supervisor':
        fail(403, 'forbidden', 'Supervisor role required')
    return identity
