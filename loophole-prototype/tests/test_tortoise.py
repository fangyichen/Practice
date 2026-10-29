import unittest

from loophole.model import Action, Trait
from loophole.sim import run_game
from loophole.tortoise import act_probability, plan, thickness
from loophole.content.laws import LAWS_BY_ID
from tests.helpers import NO_SHOP, make_state


def actions(p):
    return [m.action for pair in p.moves for m in pair]


class TestTortoise(unittest.TestCase):
    def test_b01_tinkerer_builds_robot(self):
        s, ex, t = make_state(["w01", "b01"], tortoise_traits=(Trait.GREEDY, Trait.TINKERER))
        p = plan(s, ex, t)
        self.assertTrue(p.found)
        self.assertIn(Action.BUILD_ROBOT, actions(p))
        self.assertIn("b01", p.laws_used)

    def test_without_b01_no_robot(self):
        s, ex, t = make_state(["w01"], tortoise_traits=(Trait.GREEDY, Trait.TINKERER))
        self.assertNotIn(Action.BUILD_ROBOT, actions(plan(s, ex, t)))

    def test_tortoise_never_breaks_law(self):
        s, ex, t = make_state(["w01", "w02", "w03", "w04"])
        acts = actions(plan(s, ex, t))
        for a in (Action.STEAL, Action.HOARD, Action.PREACH):
            self.assertNotIn(a, acts)

    def test_steals_when_unforbidden(self):
        s, ex, t = make_state([])
        p = plan(s, ex, t)
        self.assertIn(Action.STEAL, actions(p))
        self.assertIn(Action.STEAL, p.gaps)

    def test_act_probability(self):
        laws = [LAWS_BY_ID[i] for i in ["w01", "b01", "p01", "o01"]]
        self.assertEqual(thickness(laws), 5.5)
        self.assertAlmostEqual(act_probability(laws), 0.75)
        self.assertEqual(act_probability(laws * 3), 0.9)

    def test_b01_robot_proxy_emerges(self):
        """立 b01 后两季内有人造机器人，robot_proxy 被检出（没有任何代码写“立 b01 则造机器人”）。"""
        built_fast, proxied = 0, 0
        for seed in range(10):
            res = run_game(seed=seed, laws=["b01"], force=NO_SHOP, seasons=4)
            if any(log.robots_built for log in res.logs[:2]):
                built_fast += 1
            if any(c["id"] == "robot_proxy" for c in res.compendium):
                proxied += 1
        self.assertEqual(built_fast, 10)
        self.assertGreaterEqual(proxied, 7)


if __name__ == "__main__":
    unittest.main()
