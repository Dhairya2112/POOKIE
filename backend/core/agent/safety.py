
import platform
from pathlib import Path

# ── 1. Command Blacklist ────────────────────────────────────────────────
# No regex, purely token-based safety matching.

def is_command_blocked(command: str) -> bool:
    """Return True if `command` matches any blacklisted action."""
    cmd_lower = command.lower()
    
    # Block suspicious piping globally (curl/wget | bash)
    if "|" in cmd_lower:
        if any(shell in cmd_lower for shell in ["bash", "sh", "cmd", "powershell"]):
            return True
            
    # Normalize command for safe tokenization across multiple chained commands and subshells
    for op in ["&&", "||", "&", ";", "\n", "|", "$(", ")", "`"]:
        cmd_lower = cmd_lower.replace(op, " \n ")
        
    sub_commands = cmd_lower.split("\n")
    
    for sub_cmd in sub_commands:
        tokens = sub_cmd.split()
        if not tokens:
            continue
            
        # Skip benign command wrappers and shells to expose the true root command
        wrapper_cmds = {
            "env", "nohup", "time", "xargs", "watch", "timeout",
            "cmd", "powershell", "pwsh", "bash", "sh", "wsl",
            "/c", "-c", "-command", "-noexit", "-noprofile"
        }
        
        root_idx = 0
        root_cmd = ""
        while root_idx < len(tokens):
            # Extract the root command and strip quote obfuscation (e.g. r""m -> rm)
            root_cmd = tokens[root_idx].replace('"', '').replace("'", "")
            
            # Strip paths (e.g. c:/windows/system32/format.exe -> format.exe)
            root_cmd = root_cmd.replace("\\", "/").split("/")[-1]
            
            # Strip extensions to correctly match against blocklist
            for ext in [".exe", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".sh", ".bin"]:
                if root_cmd.endswith(ext):
                    root_cmd = root_cmd[:-len(ext)]
                    break
                
            if root_cmd in wrapper_cmds:
                root_idx += 1
            elif root_cmd in ["sudo", "su", "eval", "exec"]:
                return True # Always immediately block superuser or execution-eval wrappers
            else:
                break
                
        if root_idx >= len(tokens):
            continue
        
        # Block destructive file removal
        if root_cmd in ["rm", "remove-item"]:
            if any(flag in tokens for flag in ["-rf", "-r", "-f", "--no-preserve-root", "-recurse", "-force"]):
                return True
        
        # Block Windows deletion
        if root_cmd in ["del", "rd", "rmdir"]:
            if any(flag in tokens for flag in ["/f", "/s", "/q", "-force"]):
                return True
                
        # Block disk/system manipulation
        if root_cmd in ["format", "mkfs", "diskpart", "dd", "bcdedit", "cipher", "clear-disk", "initialize-disk"]:
            return True
            
        # Block shutdown/reboot
        if root_cmd in ["shutdown", "reboot", "init", "stop-computer", "restart-computer", "suspend-computer"]:
            return True
                    
        # Block security downgrades
        if root_cmd in ["set-executionpolicy"]:
            return True
                    
        # Block obfuscated/remote powershell execution
        if root_cmd == "powershell":
            if any(flag in tokens for flag in ["-enc", "-encodedcommand", "downloadstring", "iex"]):
                return True
                
        # Block netcat listeners
        if root_cmd in ["nc", "ncat"]:
            if any(flag in tokens for flag in ["-l", "-e", "-p"]):
                return True
                
        # Block network service disruption
        if root_cmd == "net" and len(tokens) >= 2:
            if tokens[1] == "stop":
                return True
            if "/delete" in tokens:
                return True
            
    return False


def get_blocked_reason(command: str) -> str | None:
    """Return a descriptive reason if blocked, else None."""
    if is_command_blocked(command):
        return "Command matches restricted token pattern (destructive action blocked)."
    return None


# ── 2. Path Sandboxing ──────────────────────────────────────────────────

# Directories that file tools must NEVER access.
_SYSTEM_DIRS_WINDOWS = [
    "C:\\Windows",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\ProgramData",
    "C:\\$Recycle.Bin",
]

_SYSTEM_DIRS_UNIX = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/boot",
    "/dev",
    "/proc",
    "/sys",
    "/var",
    "/root",
]


def _get_sandbox_root() -> Path:
    """The sandbox root is a dedicated subfolder in the user's home directory."""
    sandbox_dir = Path.home() / "SetuSandbox"
    try:
        sandbox_dir.mkdir(exist_ok=True)
    except Exception:
        pass
    return sandbox_dir


def is_path_allowed(target_path: str, user_id: str = None) -> bool:
    """
    Return True if `target_path` is inside the user's home sandbox OR any
    user-configured whitelisted directory, and not inside a protected system directory or dotfile path.
    """
    try:
        resolved = Path(target_path).expanduser().resolve()
    except (OSError, ValueError):
        return False

    # 1. Block dotfiles and hidden folders (e.g. .ssh, .env)
    for part in resolved.parts:
        if part.startswith('.') and part not in ('.', '..'):
            return False

    # Extra check: reject known system directories (handles symlinks/junctions)
    resolved_str = str(resolved)
    blocked_dirs = (
        _SYSTEM_DIRS_WINDOWS if platform.system() == "Windows" else _SYSTEM_DIRS_UNIX
    )
    for sdir in blocked_dirs:
        if resolved_str.lower().startswith(sdir.lower()):
            return False

    # Helper to check if child is a subpath of parent (case-insensitive on Windows)
    def _is_subpath(child: Path, parent: Path) -> bool:
        try:
            child.relative_to(parent)
            return True
        except ValueError:
            if platform.system() == "Windows":
                try:
                    c_parts = [p.lower() for p in child.parts]
                    p_parts = [p.lower() for p in parent.parts]
                    if len(c_parts) >= len(p_parts) and c_parts[:len(p_parts)] == p_parts:
                        return True
                except Exception:
                    pass
            return False

    # If running in local CLI mode, grant full home directory access AND workspace access
    if user_id == "local":
        workspace_root = Path(__file__).resolve().parents[3]
        if _is_subpath(resolved, Path.home()) or _is_subpath(resolved, workspace_root):
            return True
        return False
        
    # Check against home directory sandbox first
    sandbox = _get_sandbox_root()
    desktop = Path.home() / "Desktop"
    data_dir = Path.home() / "SETU" / "Data"
    
    if _is_subpath(resolved, sandbox) or _is_subpath(resolved, desktop) or _is_subpath(resolved, data_dir):
        return True

    # Check against user's whitelisted paths from MongoDB
    if user_id and user_id != "local":
        from core.users.models import User
        try:
            user = User.objects(user_id=user_id).first()
            if user and user.preferences:
                # Global Full Disk Access Check
                if getattr(user.preferences, 'full_disk_access', False):
                    # For safety, ensure it's at least within the user's home directory across all OS
                    if _is_subpath(resolved, Path.home()):
                        return True
                        
                # Specific Whitelisted Paths Check
                if user.preferences.whitelisted_paths:
                    for wpath in user.preferences.whitelisted_paths:
                        try:
                            wpath_resolved = Path(wpath).resolve()
                            if _is_subpath(resolved, wpath_resolved):
                                return True
                        except (OSError, ValueError):
                            pass
        except Exception:
            pass  # Fallback to home sandbox if DB query fails

    return False


# ── 3. Output Sanitization ──────────────────────────────────────────────

MAX_OUTPUT_CHARS = 2000


def sanitize_output(output: str) -> str:
    """Truncate tool output to prevent context window overflow."""
    if len(output) > MAX_OUTPUT_CHARS:
        return output[:MAX_OUTPUT_CHARS] + "\n\n... [output truncated to 2000 chars]"
    return output
