import unittest

from paradigm.presence import Presence


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class PresenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = FakeClock()
        self.presence = Presence(grace_seconds=10, clock=self.clock)

    def advance(self, seconds: float) -> None:
        self.clock.now += seconds

    def test_runs_before_any_tab_connects(self) -> None:
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_closing_the_last_tab_stops_after_grace(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(9.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())

    def test_beacon_after_the_stream_drops_also_counts(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.presence.closing("a")
        self.advance(10)
        self.assertTrue(self.presence.should_stop())

    def test_drop_without_beacon_keeps_running(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_reload_reconnects_within_grace(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1)
        self.presence.connect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_closing_one_of_two_tabs_keeps_running(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())
        self.assertEqual(self.presence.tab_count, 1)

    def test_last_tab_left_without_beacon_even_if_another_closed(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.presence.disconnect("b")  # b slept, it was not closed
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_new_tab_within_grace_cancels_stop(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(5)
        self.presence.connect("b")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_two_streams_from_one_tab_count_once(self) -> None:
        self.presence.connect("a")
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())
        self.presence.disconnect("a")
        self.advance(10)
        self.assertTrue(self.presence.should_stop())


if __name__ == "__main__":
    unittest.main()
