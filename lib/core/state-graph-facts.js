/**
 * The SHAPE of a state machine — the facts a sighted reader gets from the picture
 * in one glance and a listener was never told.
 *
 * ── WHAT WAS MISSING ──────────────────────────────────────────────────────────
 *
 * `narrateStateTransitions` reads a machine one source state at a time, in
 * AUTHORED order: "From Draft, submit goes to Submitted. From Submitted, review
 * goes to In Review. From In Review, approve goes to Approved, reject goes to
 * Draft, and revise stays here." Every edge is there and the topology is not. A
 * listener has to hold five sentences in their head and reconstruct the graph;
 * the slide hands a sighted reader the same graph instantly, which is the whole
 * reason `state-chart.docs.md` says "The chart's job is to make the topology
 * obvious in one glance."
 *
 * So this kernel computes the glance: how big the machine is, where it decides,
 * what comes back, and what cannot be reached. `state-chart.transform.js` already
 * derived the first two of these for its own purposes — start/terminal inference
 * and a forward/back test the edge router uses to pick a dash pattern — and
 * neither reached the voice.
 *
 * ── THE ONE CLAIM THIS KERNEL REFUSES TO MAKE ─────────────────────────────────
 *
 * It reports TOPOLOGY, never LAYOUT. `branchPoints` says a state has more than one
 * way out; it does not say the diagram fans out there, and a caller must not
 * phrase it that way.
 *
 * The two come apart, and the transform says so in its own words
 * (`state-chart.transform.js`, `dagrePositions`): "'some state has two successors'
 * sounds like the right question, but a SKIP edge (`1 => 2` beside `1 => 5`)
 * satisfies it while dagre still ranks the machine linearly". The real adoption
 * test is whether two nodes share a dagre rank — and it runs in the BROWSER after
 * text measurement, which narration has no access to. A narrator that said "the
 * diagram branches here" would contradict a slide drawn as a single column.
 * "In Review has three ways out" is true of both.
 */

/**
 * Normalize an edge's target. The transform writes `to`; `chart-narration.js`'s
 * own parse writes `target` and may write the literal `'self'` where the
 * transform has already resolved a self-loop to its own index. One kernel serving
 * both means accepting both rather than making either caller translate — and a
 * translation layer at two call sites is exactly the drift this module exists to
 * prevent.
 */
function edgeTarget(t, from) {
  const raw = t.to ?? t.target;
  if (raw === 'self') return from;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/**
 * WHICH STATE IS THE START, AND WHICH ARE THE ENDS — the two roles the author may
 * leave unsaid, inferred exactly as the picture infers them.
 *
 * Pure: it reports indices and mutates nothing, so the transform can stamp
 * `isStart` / `isTerminal` onto its own state objects and narration can read the
 * same answer without touching any.
 *
 * BOTH RULES ARE ALL-OR-NOTHING PER CHART, and that is the quirk worth pinning.
 * ONE state tagged `start` anywhere suppresses start inference for every state;
 * one tagged `end` suppresses terminal inference entirely. It reads like an
 * oversight and it is not — the drawn start disc and terminal double ring come
 * off these flags, so an author who tags one role is taken to have tagged all of
 * it. Narration that inferred per-state would tell a listener about a ring the
 * slide does not draw.
 */
function inferRoles(states, transitions) {
  const list = states || [];
  const hasOutgoing = new Set((transitions || []).map((t) => t.from));
  const taggedStart = list.find((s) => s.isStart);
  const anyTaggedEnd = list.some((s) => s.isTerminal);
  return {
    startIndex: taggedStart ? taggedStart.index : list[0] ? list[0].index : null,
    startInferred: !taggedStart,
    terminalIndices: new Set(
      (anyTaggedEnd ? list.filter((s) => s.isTerminal) : list.filter((s) => !hasOutgoing.has(s.index)))
        .map((s) => s.index),
    ),
    terminalsInferred: !anyTaggedEnd,
  };
}

/**
 * Every derived fact about the machine, from the same `{ states, transitions }`
 * both callers already have.
 *
 * `states` need `index` and `label`; `isStart` / `isTerminal` are read when
 * present. `transitions` need `from` plus `to` or `target`.
 */
function summarizeGraph(parsed) {
  const states = parsed?.states || [];
  const rawEdges = parsed?.transitions || [];
  const byIndex = new Map(states.map((s) => [s.index, s]));

  // Resolve once. An edge whose target names no state is DROPPED here, matching
  // `parseStateChart`, which records a transition only when its target resolves —
  // the slide draws such an edge as `typo => 9 (unresolved)` and narration reads
  // that literal text elsewhere. Counting it as an exit would make a state look
  // like a branch point on the strength of a typo.
  const edges = [];
  for (const t of rawEdges) {
    const to = edgeTarget(t, t.from);
    if (to == null || !byIndex.has(to) || !byIndex.has(t.from)) continue;
    edges.push({ from: t.from, to, event: t.event || '', isSelf: to === t.from });
  }

  const outAll = new Map();
  const outForward = new Map(); // excluding self-loops — the "ways out" count
  const incoming = new Map();
  for (const e of edges) {
    outAll.set(e.from, (outAll.get(e.from) || 0) + 1);
    if (!e.isSelf) {
      outForward.set(e.from, (outForward.get(e.from) || 0) + 1);
      incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    }
  }

  // ONE inference, shared with the transform that draws the start disc and the
  // terminal ring — not a second reading of the same rule. Note it is fed the
  // RESOLVED edges, so a dangling `typo => 9` cannot keep a state off the
  // terminal list by looking like a way out of it.
  const roles = inferRoles(states, edges);
  const start = byIndex.get(roles.startIndex) || null;
  const terminals = states.filter((s) => roles.terminalIndices.has(s.index));
  const anyTaggedEnd = !roles.terminalsInferred;

  // WHAT THE MACHINE CAN ACTUALLY ARRIVE AT — the forward closure from the start,
  // by a path of length AT LEAST ONE.
  //
  // IN-DEGREE IS NOT REACHABILITY, and the difference is what made a narrator
  // contradict itself inside two sentences: "A three-state machine from Draft to
  // Draft and Filed. … Nothing leads to Filed." Both clauses were reading true
  // facts — Filed has no way out, so it is a terminal; Filed has nothing pointing
  // at it, so it is unreachable — and together they assert a route and deny it.
  // A terminal is only an ENDPOINT of the machine if the machine can get there.
  //
  // It also catches what in-degree cannot: two states pointing at each other but
  // cut off from the start each have an incoming edge, so the old test called them
  // reachable and no surface said otherwise.
  //
  // LENGTH AT LEAST ONE is deliberate. The start is not "reached" by standing on
  // it — a start with no way out would otherwise list itself as the machine's
  // destination, which is the first half of the contradiction above. A cycle that
  // returns to the start DOES put it back in the set, which is correct: you can
  // arrive there.
  const adjacency = new Map();
  for (const e of edges) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push(e.to);
  }
  const reachable = new Set();
  if (start) {
    const queue = [start.index];
    while (queue.length) {
      for (const to of adjacency.get(queue.shift()) || []) {
        if (!reachable.has(to)) {
          reachable.add(to);
          queue.push(to);
        }
      }
    }
  }

  return {
    stateCount: states.length,
    edgeCount: edges.length,
    start,
    startInferred: roles.startInferred,
    terminals,
    terminalsInferred: roles.terminalsInferred,

    /**
     * The terminals the machine can actually REACH — what a caller should name as
     * the machine's destination. `terminals` stays the honest "has no way out"
     * set, because a hazard clause wants it whole; an ENDPOINT claim wants this.
     */
    reachableTerminals: terminals.filter((s) => reachable.has(s.index)),

    /** Every state the start can get to, by a path of length at least one. */
    reachable,

    /** States with more than one way OUT, ignoring self-loops — where the machine decides. */
    branchPoints: states
      .filter((s) => (outForward.get(s.index) || 0) > 1)
      .map((s) => ({ state: s, ways: outForward.get(s.index) })),

    /** An edge to a LOWER index — what the router dashes, and what a reader calls "back". */
    backEdges: edges.filter((e) => !e.isSelf && e.to < e.from),

    /** A state that can stay itself. `revise => self` is a real loop, not a no-op. */
    selfLoops: edges.filter((e) => e.isSelf),

    /**
     * A state whose ONLY exit is a self-loop. The transform never infers it
     * terminal, because a self-loop IS an outgoing transition — so the machine
     * can enter it and never leave, and no surface names that today. It is the
     * single most useful thing this kernel finds that nothing else knows.
     */
    traps: states.filter(
      (s) => (outAll.get(s.index) || 0) > 0 && (outForward.get(s.index) || 0) === 0,
    ),

    /**
     * A state the machine cannot get to, that is not the start. Unreachable states
     * are a real authoring defect — a renumbered list leaves them behind — and
     * nothing else in the tree looks for them, so they ship silently.
     *
     * REACHABILITY, NOT IN-DEGREE. See the `reachable` note above: an island of two
     * states pointing at each other passes an in-degree test and is still cut off.
     */
    unreachable: states.filter((s) => s.index !== start?.index && !reachable.has(s.index)),

    /**
     * A state with no way out that the author did NOT mean as an ending. Only
     * possible when some OTHER state carries an explicit `end` tag, which
     * suppresses inference for this one — exactly the case where the slide draws
     * no terminal ring and the machine still stops there.
     */
    deadEnds: anyTaggedEnd
      ? states.filter((s) => !s.isTerminal && !(outAll.get(s.index) > 0))
      : [],

    /**
     * Is this ONE PATH, start to finish — every state on it, each with one way in
     * and one way out, nothing looping back?
     *
     * A TOPOLOGY claim and never a layout one; see the module docblock.
     *
     * FOUR CONDITIONS, and the first draft had only the back-edge one. "No state has
     * more than one forward exit AND no back edge" is true of a graph that
     * CONVERGES (two states both stepping into a third), of two DISCONNECTED
     * chains, and of a list of states with no transitions at all — and it said
     * "it runs as a straight chain with no forks" about each of them, over a
     * picture plainly showing otherwise. So in-degree and reachability are checked
     * too: a chain has no state entered twice, and the walk from the start has to
     * reach every state.
     *
     * A SELF-LOOP DOES NOT DISQUALIFY ONE. "In Review can hold" is not a fork in
     * the path, and the machine still reads top to bottom.
     */
    isChain: (() => {
      if (states.length < 2 || !edges.length || !start) return false;
      const forward = edges.filter((e) => !e.isSelf);
      if (forward.some((e) => e.to < e.from)) return false;
      // THESE TWO ARE A MUTUALLY REDUNDANT PAIR, AND NEITHER MAY BE DELETED.
      // Dropping EITHER one changes nothing across every machine up to four states
      // — 132132 edge-set/order combinations, so a mutation test on either finds
      // nothing and reports the line as dead. Dropping BOTH changes 120 of them.
      // The cheapest witness is `2->3, 1->3, 1->2` in that edge order: `next` keeps
      // the last edge out of each state, so the walk covers all three while state 3
      // is entered twice. An earlier revision of this comment claimed the in-degree
      // test alone was "provably redundant" and the reasoning was right and the
      // conclusion useless — it is redundant, and so is its neighbor, and that is
      // exactly why a test cannot tell you either is safe to remove.
      // Measured and pinned in `test/unit/core/is-chain-guards.test.js`, which also
      // corrects what that revision said about `states.length < 2`: that one is
      // LOAD-BEARING, because a single state with a self-loop reads as a straight
      // chain without it.
      if (states.some((s) => (incoming.get(s.index) || 0) > 1)) return false;
      // Walk the single-exit path from the start; a chain visits everything once.
      const next = new Map(forward.map((e) => [e.from, e.to]));
      const seen = new Set();
      let at = start.index;
      while (at != null && !seen.has(at)) {
        seen.add(at);
        at = next.get(at);
      }
      return seen.size === states.length;
    })(),

    outDegree: outForward,
    edges,
  };
}

module.exports = { summarizeGraph, inferRoles, edgeTarget };
