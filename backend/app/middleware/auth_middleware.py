import base64
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from functools import lru_cache

from app.config import get_settings

security = HTTPBearer()


def _extract_clerk_domain(publishable_key: str) -> str:
    """Extract Clerk frontend API domain from publishable key."""
    # pk_test_xxxxx or pk_live_xxxxx
    # The part after pk_test_ / pk_live_ is base64-encoded domain with $ suffix
    prefix = ""
    if publishable_key.startswith("pk_test_"):
        prefix = "pk_test_"
    elif publishable_key.startswith("pk_live_"):
        prefix = "pk_live_"
    else:
        raise ValueError(f"Invalid publishable key format: {publishable_key}")

    encoded = publishable_key[len(prefix):]
    # Add padding if needed
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding

    decoded = base64.b64decode(encoded).decode("utf-8")
    # Remove trailing $ if present
    return decoded.rstrip("$")


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    settings = get_settings()
    jwks_url = settings.clerk_jwks_url

    if not jwks_url:
        publishable_key = settings.clerk_publishable_key
        if not publishable_key:
            raise ValueError("CLERK_JWKS_URL or CLERK_PUBLISHABLE_KEY must be set")
        domain = _extract_clerk_domain(publishable_key)
        jwks_url = f"https://{domain}/.well-known/jwks.json"

    print(f"[Auth] Using JWKS URL: {jwks_url}")
    return PyJWKClient(jwks_url)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    token = credentials.credentials
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_id = payload.get("sub")
        if not clerk_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub claim")
        return {
            "clerk_id": clerk_id,
            "email": payload.get("email"),
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}")
