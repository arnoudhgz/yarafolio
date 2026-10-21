import unittest
from unittest.mock import MagicMock, patch
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import autosync  # noqa: E402


class AutoSyncTest(unittest.TestCase):
    def setUp(self):
        self.syncer = autosync.AutoSync()

    @patch("subprocess.run")
    @patch.object(autosync.AutoSync, "get_env")
    @patch.object(autosync.AutoSync, "git")
    @patch("os.path.exists", return_value=True)
    def test_pull_failure_without_conflicts_aborts_early(self, mock_exists, mock_git, mock_env, mock_run):
        mock_env.side_effect = lambda k: {
            "DEMO_MODE": "0",
            "STOCKS_AUTOSYNC": "1",
            "PRIVATE_DATA_REPO": "git@github.com:test/repo.git",
        }.get(k)

        # Sequence of git calls:
        # 1. git add ...
        # 2. git diff --cached --quiet -> returns 0 (no local changes)
        # 3. git pull --no-rebase --no-edit origin main -> returns 1 (failure)
        # 4. git ls-files -u -> returns empty (no conflicts)
        def git_side_effect(*args, **kwargs):
            cmd = args[0]
            mock_res = MagicMock()
            if cmd == "diff":
                mock_res.returncode = 0
            elif cmd == "pull":
                mock_res.returncode = 1
                mock_res.stderr = "Permission denied (publickey)."
            elif cmd == "ls-files":
                mock_res.returncode = 0
                mock_res.stdout = ""
            else:
                mock_res.returncode = 0
                mock_res.stdout = ""
                mock_res.stderr = ""
            return mock_res

        mock_git.side_effect = git_side_effect

        with patch("autosync.logger.error") as mock_logger_error:
            self.syncer.sync("unit test")
            mock_logger_error.assert_called_with(
                "autosync: pull failed (network/auth issue?): Permission denied (publickey)."
            )


if __name__ == "__main__":
    unittest.main()
