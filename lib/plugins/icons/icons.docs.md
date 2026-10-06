# icons

Drawn, single-color icons, written in inline code like a spark:

```markdown
Raw files land in `^{bucket, c4}` S3 and load into `^{warehouse, c5}` Snowflake.

- `{S3, icon=bucket, c4}` raw uploads, 30-day lifecycle
- `{Lambda, icon=function, c3}` one per upload
```

The first sentence draws two icons the size of the words around them, in the deck's chart colors.
The pills lead with an icon and carry the service's name. The set is about 250 icons from
[Tabler](https://tabler.io/icons) (MIT), picked for architecture and business slides, plus two
we draw ourselves (`stream`, `gateway`). Design: `engineering/decisions/2026-09-29-inline-icons.md`.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default.
Its drawings load only for a deck that writes an icon, so a deck without one pays nothing.

## On its own: `^{…}`

The icon's name comes first, then any of these words, in any order:

| word | what it does | default |
|---|---|---|
| `c1` … `c12` | the color slot, the same cycle sparks and charts use | `c1` |
| `sm` `md` `lg` | the size, relative to the text around it | `md` |
| `framed` `bare` | a square tile behind the icon, or the lines alone | `framed` |
| `pigment` `etching` `tone` | how the color is spent: an ink tile with knocked-out lines; a clear tile with ink lines; a pale tint with ink lines | `pigment` |
| `square` `rounded` | the tile's corners | `square` |
| `label="…"` | what a screen reader says, when the icon's own name is not right | the name, in words |

`^{database}`, `^{database, c3, lg}`, `^{bucket, c4, bare}`, `^{shield, etching, rounded}`,
`^{server, label="Primary DB host"}`.

An inline icon is an image with a name (`role="img"`), so a reader hears it where it stands.

## Inside a pill: `icon=`

```markdown
`{S3, icon=bucket, c4}`         the icon leads the label, in the pill's color
`{Primary, icon=database, tag}` any pill shape
`{icon=database}`               an icon with no label
```

`icon` must be written by name: a pill's first word is its label, so `{database}` stays a pill
that says "database". Inside a pill the icon is always bare, and it is decorative: the label
says it. With the plugin off, the pill shows its label alone.

## In a chart node: `icon=` and `icon-only`

```markdown
- API `{#api, diamond, c2, icon=gateway}`     flowchart: the icon beside the name
- Bucket `{icon=bucket, icon-only, c4}`       the icon alone; the name is still its name
- Paid `{on-track, icon=card}`                state chart: the same two words
```

The flowchart and the state chart read `icon=` and `icon-only` in the same record as a shape's
other style words. The icon sits before the name, or above it when the chart is pinned `tb`; the
author does not place it. Inside a node the icon is always bare, in the name's ink: the node is
already the tile. `icon-only` draws the icon alone, and the name stays as the hover title and as
what a screen reader and the chart's description say, so a row needs its words even then
(`- \`{icon=database, icon-only}\`` with no name is refused). A name the set does not have is
coached (`flowchart-unknown-icon`) and the node shows its text. A group's title draws no icon. With
the plugin off, every node shows its text alone, exactly as if no icon were written. Hub-spoke
does not take icons yet.

## The deck and the slide: `icon:` and `icon-*`

```yaml
icon: bare etching
```

The `icon:` register styles every icon on the deck, one word per axis (frame, look, corners).
A slide overrides it with its own class (`<!-- _class: icon-framed -->`), on that axis only, and
an icon's own word wins over both. It is separate from `spark:`, so a deck can frame its sparks
and leave its icons bare.

## Cloud services: a role icon and the service's name

There are no vendor logos and no per-service vendor icons. The official AWS, Azure and Google
Cloud icons ship under vendor terms, not an open-source license, and they are multicolored. A
cloud service is a role icon, the service's name, and a color:

```markdown
- `{S3, icon=bucket, c4}` · `{Lambda, icon=function, c3}` · `{Snowflake, icon=warehouse, c5}`
```

Write a vendor name as an icon (`^{s3}`, `icon=lambda`) and the span stays code, and
`lint:deck` names the role icon to use: "`s3` is a service, not an icon — use the role icon
`bucket` and put s3 in the text beside it". The table of about 100 service names is
`lib/plugins/_icons-source/coaching.json`.

## What stays literal

A span that opens with `^{` and does not read stays code, and nothing is guessed: an unknown
name, a repeated or unknown word, `c13`. `lint:deck` warns (`icon-literal`) with the reason and,
for a typo, the nearest names. `\^{database}` shows the notation itself. A regex anchor
(`` `^foo` ``) is not an icon: only `^{` followed by a word opens one.

An alias and its icon are one icon written two ways, so `lint:deck` asks a deck to pick one
(`mixed-spelling`): `^{db}` among three `^{database}` gets a warning and a one-click fix.

## The set

Names are ours, not Tabler's: an author writes `bucket`, not `bucket-droplet`, so the source can
change without a deck noticing. Aliases are in brackets. No icon draws letters (`api`, `www`):
letters are not in the deck's typeface and do not survive 16 px.

| category | icons |
|---|---|
| compute | `server`, `server-stack`, `cpu` (processor, chip), `container`, `containers`, `cluster` (k8s, kubernetes), `function` (fn, serverless), `virtual-machine` (vm), `batch`, `scheduler` (cron), `timer`, `worker`, `engine`, `gpu`, `edge` (cdn), `cloud`, `cloud-compute`, `region`, `zone`, `autoscale` |
| storage | `bucket`, `object-store`, `disk`, `volume`, `file`, `files`, `file-text`, `folder`, `folders`, `archive`, `backup`, `restore`, `snapshot`, `sd-card`, `tape`, `cold-storage`, `share` |
| data | `database` (db), `database-export`, `database-import`, `database-search`, `database-settings`, `table`, `warehouse` (dw), `lake` (datalake), `schema`, `etl`, `pipeline`, `merge`, `filter`, `sort`, `query`, `index`, `cache`, `graph`, `chart`, `chart-line`, `chart-pie`, `report`, `dashboard`, `model` (ml), `robot` (bot), `ai`, `vector`, `dataset`, `stream`, `json`, `code`, `notebook` |
| network | `network`, `globe` (internet), `dns`, `router`, `switch`, `load-balancer` (lb), `gateway` (api-gateway), `firewall`, `vpc`, `subnet`, `vpn`, `peering`, `link`, `unlink`, `wifi`, `antenna`, `access-point`, `topology`, `mesh`, `bus-topology`, `route`, `sitemap`, `hierarchy`, `tree`, `plug`, `satellite`, `proxy`, `transfer` |
| security | `shield`, `shield-check`, `shield-lock`, `lock`, `unlock`, `key`, `secret` (vault), `certificate` (cert, tls), `identity` (iam), `id-card`, `fingerprint`, `user-shield`, `user-check`, `eye`, `eye-off`, `scan`, `bug`, `virus`, `alert` (warning), `policy`, `audit`, `license`, `lock-password`, `2fa` (mfa) |
| integration | `queue`, `dequeue`, `event-bus`, `event`, `webhook`, `message`, `messages`, `mail` (email), `mail-forward`, `send`, `inbox`, `notification`, `broadcast` (pubsub), `plugin`, `connector`, `exchange`, `retry`, `replace`, `refresh` (sync), `workflow`, `branch`, `commit`, `pull-request`, `fork`, `api`, `library` |
| observability | `monitor` (monitoring), `heartbeat`, `pulse`, `gauge`, `logs` (log), `trace` (tracing), `metrics`, `alarm`, `bell-ringing`, `radar`, `target`, `zoom`, `search`, `inspect`, `health`, `incident`, `status`, `error`, `info`, `question`, `uptime`, `latency` |
| delivery | `rocket` (deploy), `release`, `package`, `package-export`, `package-import`, `truck`, `delivery`, `build`, `tool`, `tools`, `settings` (config), `adjustments`, `terminal` (cli, shell), `test`, `checklist`, `clipboard-check`, `template`, `layers`, `feature-flag` (flag), `rollback`, `canary`, `blue-green`, `versions` |
| clients | `mobile` (phone), `tablet`, `laptop`, `desktop`, `watch`, `tv`, `browser` (web), `app-window`, `apps`, `devices`, `iot`, `sensor`, `printer`, `camera`, `microphone`, `speaker`, `headphones`, `car` (vehicle), `game`, `kiosk`, `qr`, `cast` |
| people | `user` (person), `users` (team), `user-circle`, `users-group`, `admin`, `customer`, `support`, `developer` (dev), `building` (office), `community`, `home`, `school`, `hospital`, `store` (shop), `factory`, `bank`, `handshake` (partner), `chat`, `thumb-up`, `thumb-down` |
| business | `briefcase`, `cart`, `credit-card` (card), `payment` (payments), `receipt`, `invoice`, `coin`, `dollar`, `euro`, `wallet`, `chart-candle`, `trending-up`, `trending-down`, `scale`, `calendar`, `clock` (time), `flag-goal`, `trophy`, `star`, `target-goal` (goal), `bulb` (idea), `compass`, `map`, `book`, `document` (doc), `presentation`, `contract`, `leaf`, `award`, `ticket`, `gift` |

The list is `lib/plugins/_icons-source/curation.json`; `tools/build-icons-data.js` turns it into the drawings and
checks every node is plain geometry (no fill, no style, no link).

## Where it renders

The engine draws icons at parse time, as it draws sparks, so the CLI's PDF and HTML exports, the
Studio and the player agree. In the Studio the drawings arrive as their own script
(`lattice-plugin-icons.js`) before the first render of a deck that writes an icon. Until they
arrive — and on a raw Marp preview, where no Lattice engine runs and the page has not loaded that
script — an icon, and a pill that asks for one, stay code as written: nothing is drawn without
the icon the author asked for. With the plugin switched off, a pill shows its label alone and a
chart node its name.

On a sketch slide (`mode: sketch`, or a slide's `sketch` class), a framed icon's tile is redrawn
by hand in its own edge color, as a spark's is, so the two read as one hand. The drawing inside
stays crisp, a bare icon has no tile to ink, and an icon in the header or footer stays clean.

TeX is not an icon: `` `^{2}` `` and `` `\^{o}` `` stay exactly as written. Only `^{` followed by a
name (two or more letters, digits or hyphens) opens one.

## Anti-patterns

- **An icon as the only carrier of meaning.** Color groups and the shape helps, but the words
  beside it say what it is (§ 8 of the design note).
- **A vendor's icon redrawn.** Use the role icon and the service's name.
- **A row of icons with no words.** `{icon=database}` alone is for a legend or a key, not a
  sentence.
