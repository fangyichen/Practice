import unittest

from loophole.content.laws import LAWS_BY_ID
from loophole.engine import assess, robot_yield_to_owner
from loophole.expand import expand_code
from loophole.model import Action, EntityType, Phase, Season, Villager
from tests.helpers import make_state

ROBOT = Villager(vid=99, name="r", traits=[], etype=EntityType.ROBOT, wealth=0, owner=1)


def law_ids_hitting_robot(laws, action, phase=Phase.DAY):
    ex = expand_code([LAWS_BY_ID[i] for i in laws])
    return [r.law_id for r in ex.matching(EntityType.ROBOT, [], 0, action, phase, Season.SPRING)]


class TestExpand(unittest.TestCase):
    def test_human_does_not_include_robot_by_default(self):
        self.assertEqual(law_ids_hitting_robot(["w05", "b05"], Action.BUILD_ROBOT), [])
        self.assertEqual(law_ids_hitting_robot(["w05", "b05"], Action.FARM), [])

    def test_p01_makes_human_laws_hit_robots(self):
        self.assertEqual(law_ids_hitting_robot(["w05", "p01"], Action.BUILD_ROBOT), ["w05"])
        self.assertEqual(law_ids_hitting_robot(["b05", "p01"], Action.FARM), ["b05"])
        self.assertEqual(law_ids_hitting_robot(["b10", "p01"], Action.FARM, Phase.NIGHT), ["b10"])

    def test_p01_changes_robot_economics(self):
        # b01 + b10：夜工补贴只给人；p01 之后机器人夜里也拿补贴 → 造物者收益上升
        s, ex, t = make_state(["b01", "b10"])
        before = robot_yield_to_owner(s, ex, t)
        s2, ex2, t2 = make_state(["b01", "b10", "p01"])
        after = robot_yield_to_owner(s2, ex2, t2)
        self.assertEqual(before, 6)
        self.assertEqual(after, 8)

    def test_double_fines_and_suspend(self):
        ex = expand_code([LAWS_BY_ID[i] for i in ["w01", "p03", "p02"]])
        r = ex.rules[0]
        self.assertEqual(r.effect.fine, 8)
        self.assertFalse(r.hits(EntityType.HUMAN, [], 0, Action.STEAL, Phase.DAY, Season.WINTER))
        self.assertTrue(r.hits(EntityType.HUMAN, [], 0, Action.STEAL, Phase.DAY, Season.AUTUMN))

    def test_no_vicarious_blocks_owner_redirect(self):
        s, ex, t = make_state(["b01", "g03"])
        self.assertEqual(robot_yield_to_owner(s, ex, t), 0)


if __name__ == "__main__":
    unittest.main()
