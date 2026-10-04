---
marp: true
theme: indaco
paginate: true
---

<!-- A deliberately over-budget figure: the type-floor watcher's integration test needs a
     deck whose text lands below the legibility floor ON PURPOSE. It used to borrow the
     state-chart gallery, which stopped tripping the floor once that chart learned to wrap
     (2026-09-24) — a fixture that is illegible by accident stops being one when the
     component improves. Thirty-six states, each with a skip and a back-edge, is past any
     layout's budget on one slide. -->

<!-- _class: state-chart -->

## Too many states for one slide.

1. State number 1 `start`
   - `{advance to the next stage, to=2}`
   - `{skip ahead three stages, to=4}`
2. State number 2
   - `{advance to the next stage, to=3}`
   - `{skip ahead three stages, to=5}`
3. State number 3
   - `{advance to the next stage, to=4}`
   - `{skip ahead three stages, to=6}`
   - `{return two stages back, to=1}`
4. State number 4
   - `{advance to the next stage, to=5}`
   - `{skip ahead three stages, to=7}`
   - `{return two stages back, to=2}`
5. State number 5
   - `{advance to the next stage, to=6}`
   - `{skip ahead three stages, to=8}`
   - `{return two stages back, to=3}`
6. State number 6
   - `{advance to the next stage, to=7}`
   - `{skip ahead three stages, to=9}`
   - `{return two stages back, to=4}`
7. State number 7
   - `{advance to the next stage, to=8}`
   - `{skip ahead three stages, to=10}`
   - `{return two stages back, to=5}`
8. State number 8
   - `{advance to the next stage, to=9}`
   - `{skip ahead three stages, to=11}`
   - `{return two stages back, to=6}`
9. State number 9
   - `{advance to the next stage, to=10}`
   - `{skip ahead three stages, to=12}`
   - `{return two stages back, to=7}`
10. State number 10
   - `{advance to the next stage, to=11}`
   - `{skip ahead three stages, to=13}`
   - `{return two stages back, to=8}`
11. State number 11
   - `{advance to the next stage, to=12}`
   - `{skip ahead three stages, to=14}`
   - `{return two stages back, to=9}`
12. State number 12
   - `{advance to the next stage, to=13}`
   - `{skip ahead three stages, to=15}`
   - `{return two stages back, to=10}`
13. State number 13
   - `{advance to the next stage, to=14}`
   - `{skip ahead three stages, to=16}`
   - `{return two stages back, to=11}`
14. State number 14
   - `{advance to the next stage, to=15}`
   - `{skip ahead three stages, to=17}`
   - `{return two stages back, to=12}`
15. State number 15
   - `{advance to the next stage, to=16}`
   - `{skip ahead three stages, to=18}`
   - `{return two stages back, to=13}`
16. State number 16
   - `{advance to the next stage, to=17}`
   - `{skip ahead three stages, to=19}`
   - `{return two stages back, to=14}`
17. State number 17
   - `{advance to the next stage, to=18}`
   - `{skip ahead three stages, to=20}`
   - `{return two stages back, to=15}`
18. State number 18
   - `{advance to the next stage, to=19}`
   - `{skip ahead three stages, to=21}`
   - `{return two stages back, to=16}`
19. State number 19
   - `{advance to the next stage, to=20}`
   - `{skip ahead three stages, to=22}`
   - `{return two stages back, to=17}`
20. State number 20
   - `{advance to the next stage, to=21}`
   - `{skip ahead three stages, to=23}`
   - `{return two stages back, to=18}`
21. State number 21
   - `{advance to the next stage, to=22}`
   - `{skip ahead three stages, to=24}`
   - `{return two stages back, to=19}`
22. State number 22
   - `{advance to the next stage, to=23}`
   - `{skip ahead three stages, to=25}`
   - `{return two stages back, to=20}`
23. State number 23
   - `{advance to the next stage, to=24}`
   - `{skip ahead three stages, to=26}`
   - `{return two stages back, to=21}`
24. State number 24
   - `{advance to the next stage, to=25}`
   - `{skip ahead three stages, to=27}`
   - `{return two stages back, to=22}`
25. State number 25
   - `{advance to the next stage, to=26}`
   - `{skip ahead three stages, to=28}`
   - `{return two stages back, to=23}`
26. State number 26
   - `{advance to the next stage, to=27}`
   - `{skip ahead three stages, to=29}`
   - `{return two stages back, to=24}`
27. State number 27
   - `{advance to the next stage, to=28}`
   - `{skip ahead three stages, to=30}`
   - `{return two stages back, to=25}`
28. State number 28
   - `{advance to the next stage, to=29}`
   - `{skip ahead three stages, to=31}`
   - `{return two stages back, to=26}`
29. State number 29
   - `{advance to the next stage, to=30}`
   - `{skip ahead three stages, to=32}`
   - `{return two stages back, to=27}`
30. State number 30
   - `{advance to the next stage, to=31}`
   - `{skip ahead three stages, to=33}`
   - `{return two stages back, to=28}`
31. State number 31
   - `{advance to the next stage, to=32}`
   - `{skip ahead three stages, to=34}`
   - `{return two stages back, to=29}`
32. State number 32
   - `{advance to the next stage, to=33}`
   - `{skip ahead three stages, to=35}`
   - `{return two stages back, to=30}`
33. State number 33
   - `{advance to the next stage, to=34}`
   - `{skip ahead three stages, to=36}`
   - `{return two stages back, to=31}`
34. State number 34
   - `{advance to the next stage, to=35}`
   - `{return two stages back, to=32}`
35. State number 35
   - `{advance to the next stage, to=36}`
   - `{return two stages back, to=33}`
36. State number 36 `end`
   - `{return two stages back, to=34}`
