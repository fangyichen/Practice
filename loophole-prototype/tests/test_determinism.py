import os
import subprocess
import sys
import unittest
from pathlib import Path

from loophole.sim import run_game

ROOT = Path(__file__).resolve().parent.parent


class TestDeterminism(unittest.TestCase):
    def test_same_seed_same_log(self):
        for strategy in ("greedy", "cautious", "random"):
            a = run_game(seed=7, strategy=strategy).text
            b = run_game(seed=7, strategy=strategy).text
            self.assertEqual(a, b)

    def test_different_seed_differs(self):
        self.assertNotEqual(run_game(seed=1).text, run_game(seed=2).text)

    def test_across_processes(self):
        outs = []
        for hashseed in ("1", "12345"):
            env = dict(os.environ, PYTHONHASHSEED=hashseed)
            r = subprocess.run([sys.executable, "-m", "loophole", "run", "--seed", "42", "--auto"],
                               cwd=ROOT, env=env, capture_output=True, text=True, check=True)
            outs.append(r.stdout)
        self.assertEqual(outs[0], outs[1])


if __name__ == "__main__":
    unittest.main()
