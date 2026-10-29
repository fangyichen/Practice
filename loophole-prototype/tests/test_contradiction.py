import unittest

from loophole.content.laws import LAWS_BY_ID
from loophole.expand import expand_code
from loophole.model import Action, EntityType, Phase, Principle, Trait
from loophole.sim import run_game
from loophole.tortoise import adjudicator, find_contradictions
from tests.helpers import NO_SHOP


def contradictions(ids):
    return find_contradictions(expand_code([LAWS_BY_ID[i] for i in ids]))


class TestContradiction(unittest.TestCase):
    def test_b08_w04_detected(self):
        cs = contradictions(["b08", "w04"])
        self.assertEqual(len(cs), 1)
        c = cs[0]
        self.assertEqual((c.law_a, c.law_b), ("b08", "w04"))
        etype, trait, action, phase, _ = c.situation
        self.assertEqual((etype, trait, action, phase),
                         (EntityType.HUMAN, Trait.PIOUS, Action.PREACH, Phase.DAY))

    def test_no_false_positive(self):
        self.assertEqual(contradictions(["w01", "b01", "b03", "b05", "w05"]), [])

    def test_meta_creates_contradiction(self):
        # 没有预先列出的矛盾：p01 让 b05“人必须种田”命中机器人，而 w10 禁止机器人夜里做任何事
        self.assertEqual(contradictions(["b05", "w10"]), [])
        cs = contradictions(["b05", "w10", "p01"])
        self.assertEqual([(c.law_a, c.law_b) for c in cs], [("b05", "w10")])

    def test_principles_adjudicate(self):
        c = contradictions(["b08", "w04"])[0]
        self.assertIsNone(adjudicator([], c))
        self.assertEqual(adjudicator([("g02", Principle.STRICTER_WINS)], c)[0], "g02")
        self.assertIsNone(adjudicator([("g03", Principle.NO_VICARIOUS)], c))

    def _first_invocation(self, res):
        for log in res.logs:
            if log.tortoise and log.tortoise["acted"]:
                return log
        self.fail("乌龟一次都没出手")

    def test_tortoise_invokes_and_collapses(self):
        for seed in range(5):
            res = run_game(seed=seed, laws=["b08", "w04"], force=NO_SHOP)
            log = self._first_invocation(res)
            self.assertEqual(len(log.invocations), 1, f"seed {seed}")
            inv = log.invocations[0]
            self.assertEqual(inv["outcome"], "collapse")
            self.assertEqual(inv["repealed"], "w04")
            self.assertNotIn("w04", log.code)
            self.assertGreaterEqual(res.state.collapses, 1)

    def test_g02_foils_tortoise(self):
        for seed in range(5):
            res = run_game(seed=seed, laws=["b08", "w04", "g02"], force=NO_SHOP)
            log = self._first_invocation(res)
            self.assertEqual(log.invocations[0]["outcome"], "resolved", f"seed {seed}")
            ids = [c["id"] for c in res.compendium]
            self.assertIn("tortoise_foiled", ids)
            self.assertEqual(res.state.collapses, 0)


if __name__ == "__main__":
    unittest.main()
