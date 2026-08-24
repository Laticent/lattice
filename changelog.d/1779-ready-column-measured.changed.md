- **Changed: the Ready column now holds 64 cards instead of 4.** Running the
  Definition of Ready gate against every open issue showed the queue was not
  blocked on the parser — 64 of 215 open cards already met the bar and simply
  had never been labeled. `engineering/workflow.md` records the measurement,
  including that the hand-written-heading aliases added in #1779 rescued none of
  them, and that the earlier "6 of 167" figure undercounted because
  `GET /issues` returns pull requests too.
