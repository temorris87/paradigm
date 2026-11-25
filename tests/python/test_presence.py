import unittest

from paradigm.presence import BEACON, IDLE, WAKE_GAP_SECONDS, Presence

POLL = 0.25  # how often app.wait_for_stop checks


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


class PresenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clock = FakeClock()
        self.presence = Presence(grace_seconds=10, idle_seconds=60, clock=self.clock)

    def advance(self, seconds: float) -> None:
        """Lets time pass while the server polls, as wait_for_stop does (no sleep gap)."""
        target = self.clock.now + seconds
        while self.clock.now + POLL < target:
            self.clock.now += POLL
            self.presence.should_stop()
        self.clock.now = target

    def jump(self, seconds: float) -> None:
        """The machine sleeps: no check runs while the clock moves on."""
        self.clock.now += seconds

    def test_runs_before_any_tab_connects(self) -> None:
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())
        self.assertIsNone(self.presence.stop_reason)

    def test_closing_the_last_tab_stops_after_grace(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(9.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, BEACON)

    def test_beacon_after_the_stream_drops_also_counts(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.presence.closing("a")
        self.advance(9.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, BEACON)

    def test_late_beacon_shortens_from_its_arrival(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(3)
        self.presence.closing("a")
        self.advance(9.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())

    def test_beacon_never_lengthens_the_idle_deadline(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(55)
        self.presence.closing("a")
        self.advance(5)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, IDLE)

    def test_drop_without_beacon_stops_after_idle(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(59.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, IDLE)

    def test_reconnect_within_idle_cancels_stop(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(30)
        self.presence.connect("a")
        self.advance(120)
        self.assertFalse(self.presence.should_stop())

    def test_reload_reconnects_within_grace(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1)
        self.presence.connect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())

    def test_one_of_two_tabs_leaving_without_beacon_keeps_running(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.disconnect("a")
        self.advance(120)
        self.assertFalse(self.presence.should_stop())
        self.assertEqual(self.presence.tab_count, 1)

    def test_closing_one_of_two_tabs_keeps_running(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1000)
        self.assertFalse(self.presence.should_stop())
        self.assertEqual(self.presence.tab_count, 1)

    def test_beacon_from_a_tab_not_last_to_leave_waits_for_idle(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.presence.disconnect("b")  # b slept, it was not closed
        self.advance(10)
        self.assertFalse(self.presence.should_stop())
        self.advance(50)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, IDLE)

    def test_beacon_from_a_tab_that_reconnected_waits_for_idle(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.presence.connect("a")  # a reload: the beacon no longer counts
        self.presence.disconnect("a")
        self.advance(10)
        self.assertFalse(self.presence.should_stop())
        self.advance(50)
        self.assertTrue(self.presence.should_stop())

    def test_late_beacon_from_another_tab_does_not_shorten(self) -> None:
        self.presence.connect("a")
        self.presence.connect("b")
        self.presence.disconnect("a")
        self.presence.disconnect("b")
        self.presence.closing("a")  # a left first, b was the last
        self.advance(10)
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

    def test_open_tab_never_stops(self) -> None:
        self.presence.connect("a")
        self.advance(300)
        self.assertFalse(self.presence.should_stop())

    def test_wake_restarts_the_idle_deadline(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(1)
        self.jump(2 * 3600)
        self.assertFalse(self.presence.should_stop())
        self.advance(59.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, IDLE)

    def test_wake_restarts_the_beacon_deadline(self) -> None:
        self.presence.connect("a")
        self.presence.closing("a")
        self.presence.disconnect("a")
        self.advance(1)
        self.jump(2 * 3600)
        self.assertFalse(self.presence.should_stop())
        self.advance(9.9)
        self.assertFalse(self.presence.should_stop())
        self.advance(0.1)
        self.assertTrue(self.presence.should_stop())
        self.assertEqual(self.presence.stop_reason, BEACON)

    def test_gap_up_to_the_wake_limit_is_not_a_wake(self) -> None:
        self.presence.connect("a")
        self.presence.disconnect("a")
        self.advance(56)
        self.assertFalse(self.presence.should_stop())
        self.jump(WAKE_GAP_SECONDS)
        self.assertTrue(self.presence.should_stop())

    def test_sleep_with_no_deadline_arms_nothing(self) -> None:
        self.presence.connect("a")
        self.presence.should_stop()
        self.jump(2 * 3600)
        self.assertFalse(self.presence.should_stop())


if __name__ == "__main__":
    unittest.main()
