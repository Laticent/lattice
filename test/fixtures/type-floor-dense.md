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
   - `advance to the next stage => 2`
   - `skip ahead three stages => 4`
2. State number 2
   - `advance to the next stage => 3`
   - `skip ahead three stages => 5`
3. State number 3
   - `advance to the next stage => 4`
   - `skip ahead three stages => 6`
   - `return two stages back => 1`
4. State number 4
   - `advance to the next stage => 5`
   - `skip ahead three stages => 7`
   - `return two stages back => 2`
5. State number 5
   - `advance to the next stage => 6`
   - `skip ahead three stages => 8`
   - `return two stages back => 3`
6. State number 6
   - `advance to the next stage => 7`
   - `skip ahead three stages => 9`
   - `return two stages back => 4`
7. State number 7
   - `advance to the next stage => 8`
   - `skip ahead three stages => 10`
   - `return two stages back => 5`
8. State number 8
   - `advance to the next stage => 9`
   - `skip ahead three stages => 11`
   - `return two stages back => 6`
9. State number 9
   - `advance to the next stage => 10`
   - `skip ahead three stages => 12`
   - `return two stages back => 7`
10. State number 10
   - `advance to the next stage => 11`
   - `skip ahead three stages => 13`
   - `return two stages back => 8`
11. State number 11
   - `advance to the next stage => 12`
   - `skip ahead three stages => 14`
   - `return two stages back => 9`
12. State number 12
   - `advance to the next stage => 13`
   - `skip ahead three stages => 15`
   - `return two stages back => 10`
13. State number 13
   - `advance to the next stage => 14`
   - `skip ahead three stages => 16`
   - `return two stages back => 11`
14. State number 14
   - `advance to the next stage => 15`
   - `skip ahead three stages => 17`
   - `return two stages back => 12`
15. State number 15
   - `advance to the next stage => 16`
   - `skip ahead three stages => 18`
   - `return two stages back => 13`
16. State number 16
   - `advance to the next stage => 17`
   - `skip ahead three stages => 19`
   - `return two stages back => 14`
17. State number 17
   - `advance to the next stage => 18`
   - `skip ahead three stages => 20`
   - `return two stages back => 15`
18. State number 18
   - `advance to the next stage => 19`
   - `skip ahead three stages => 21`
   - `return two stages back => 16`
19. State number 19
   - `advance to the next stage => 20`
   - `skip ahead three stages => 22`
   - `return two stages back => 17`
20. State number 20
   - `advance to the next stage => 21`
   - `skip ahead three stages => 23`
   - `return two stages back => 18`
21. State number 21
   - `advance to the next stage => 22`
   - `skip ahead three stages => 24`
   - `return two stages back => 19`
22. State number 22
   - `advance to the next stage => 23`
   - `skip ahead three stages => 25`
   - `return two stages back => 20`
23. State number 23
   - `advance to the next stage => 24`
   - `skip ahead three stages => 26`
   - `return two stages back => 21`
24. State number 24
   - `advance to the next stage => 25`
   - `skip ahead three stages => 27`
   - `return two stages back => 22`
25. State number 25
   - `advance to the next stage => 26`
   - `skip ahead three stages => 28`
   - `return two stages back => 23`
26. State number 26
   - `advance to the next stage => 27`
   - `skip ahead three stages => 29`
   - `return two stages back => 24`
27. State number 27
   - `advance to the next stage => 28`
   - `skip ahead three stages => 30`
   - `return two stages back => 25`
28. State number 28
   - `advance to the next stage => 29`
   - `skip ahead three stages => 31`
   - `return two stages back => 26`
29. State number 29
   - `advance to the next stage => 30`
   - `skip ahead three stages => 32`
   - `return two stages back => 27`
30. State number 30
   - `advance to the next stage => 31`
   - `skip ahead three stages => 33`
   - `return two stages back => 28`
31. State number 31
   - `advance to the next stage => 32`
   - `skip ahead three stages => 34`
   - `return two stages back => 29`
32. State number 32
   - `advance to the next stage => 33`
   - `skip ahead three stages => 35`
   - `return two stages back => 30`
33. State number 33
   - `advance to the next stage => 34`
   - `skip ahead three stages => 36`
   - `return two stages back => 31`
34. State number 34
   - `advance to the next stage => 35`
   - `return two stages back => 32`
35. State number 35
   - `advance to the next stage => 36`
   - `return two stages back => 33`
36. State number 36 `end`
   - `return two stages back => 34`
