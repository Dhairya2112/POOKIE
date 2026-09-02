
from core.users.models import User

PERMISSION_DENIED_MSG = (
    "I don't have permission to do that. "
    "You can enable this in Settings > Permissions."
)


from django.core.cache import cache


def check_permission(user_id: str, required_level: int) -> bool:
    """
    Return True if the user has granted the required permission level.

    Parameters
    ----------
    user_id : str
        The UUID of the requesting user.
    required_level : int
        1, 2, or 3 — the minimum level the tool requires.
    """
    if required_level <= 1:
        return True  # Level 1 tools are always allowed

    if user_id == "local":
        return True  # Local listener loop runs with full access by default

    if required_level >= 3:
        return False  # Level 3 always requires manual UAC prompt (not yet implemented)

    # Use a 5-minute cache to avoid sync DB hits inside thread pool
    cache_key = f"user_permissions_{user_id}"
    level_2_granted = cache.get(cache_key)
    
    if level_2_granted is None:
        user = User.objects(user_id=user_id).first()
        if user is None:
            return False  # Unknown user — deny by default
        level_2_granted = bool(user.permissions and user.permissions.level_2_granted)
        cache.set(cache_key, level_2_granted, 300)
        
    if required_level == 2:
        return level_2_granted

    return False
