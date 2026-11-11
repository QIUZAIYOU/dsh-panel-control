// Static gate for the sidebar layout guard (discussion #12083).
//
// The guard is CSS plus a handful of attributes the engine writes; neither is
// reachable from a node unit test because client.js only loads inside the page
// module loader. These assertions keep the pieces the runtime check proved are
// necessary from silently disappearing in a refactor.
import { existsSync, readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const client = read('client.js');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const screenshots = JSON.parse(read('screenshots.json'));
const problems = [];

const expect = (ok, message) => {
  if (!ok) problems.push(message);
};

for (const marker of [
  'data-dpc-list',
  'data-dpc-unbounded',
  'data-dpc-region',
  '--dpc-panellist-max',
  'data-dpc-group-id',
  'dpc-caret',
  'dpc-sepCount',
  'layoutTitle',
  'layoutGuard',
  'layoutMaxNone',
  'toggleCollapse',
  'layoutBridge',
  'dpc-bridgeBar',
  'registrantOf',
  'dpc-nameTag',
  'data-dpc-label',
  'applyNames',
  'layoutTags',
  'layoutCounts',
  'countsOn',
  'hiddenGroups',
  'hiddenIdsOf',
  'toggleGroupHidden',
  'groupHiddenChip',
  'dpc-treeGrid',
  'dpc-pane--plugins',
  'dpc-pane--groups',
  'pluginsTitle',
  'treeGroupEmpty',
  'ungroupHint',
  'moveRowToGroup',
  'dragSource',
  'dragTarget',
  'dropRowOnGroup',
  'dropSlot',
  'setDragImage',
  'groupFold',
  'dpc-treeCaret',
  'data-collapsed',
  'toggleGroupVisibility',
  'autoSkip',
  'autoSkipSet',
]) {
  expect(client.includes(marker), 'client.js lost ' + marker);
}

// A bridged row is only as good as the two halves it registers: a keyed main
// entry the layout can select, and the host-rendered settings section it shows.
expect(client.includes('BRIDGE_ORDER = 85'), 'bridged rows lost their order slot');
expect(client.includes('out.bridge = raw.bridge !== false'), 'the bridge switch is not persisted');
expect(
  client.includes('BRIDGE_SLOT_PREFIX') &&
    client.includes('children: { [slotName]: { kind: \'single\', scope: \'root\' } }') &&
    client.includes('renderSlot(slotName, { close: back }, {})'),
  'the bridged page no longer renders through its own child slot',
);
expect(/\.dpc-bridgeBar\{[^}]*min-height:40px/.test(client), 'the bridge bar lost its 40px row height');

// "Timely" for a newly installed settings-only plugin is four signals, not one:
// the panel registry re-runs the engine and the bridge, the section registry
// re-runs the bridge, the boot ladder catches late registrations, and the slot
// declaration re-installs the watch. Losing any of them delays the row to a
// reload, which is the failure mode this gate exists to catch.
expect(client.includes('const BRIDGE_RETRY_MS = [350, 900, 2000, 4200, 8000, 15000];'), 'the boot rescan ladder lost its cadence');
expect(client.includes('const dispose = slots.subscribe(SLOT_SETTINGS, () => scheduleBridgeSync());'), 'a late settings section no longer triggers a bridge sync');
const panelWatchAt = client.indexOf('ctx.slots.subscribe(SLOT_PANELS, () => {');
const panelWatch = panelWatchAt < 0 ? '' : client.slice(panelWatchAt, panelWatchAt + 220);
expect(panelWatch.includes('engineRef.schedule()') && panelWatch.includes('scheduleBridgeSync()'), 'the panel registry no longer refreshes the engine and the bridge');
// The last such call is the declaration callback; the earlier one registers our own page.
const settingsInjectAt = client.lastIndexOf('ctx.slots.inject(SLOT_SETTINGS, () => {');
const settingsInject = settingsInjectAt < 0 ? '' : client.slice(settingsInjectAt, settingsInjectAt + 220);
expect(settingsInject.includes('unwatchSettings();') && settingsInject.includes('watchSettings();') && settingsInject.includes('kickBridge();'), 'the settings watch is no longer re-installed on declaration');

// A renamed row keeps its host label addressable while the visible title changes;
// the original-name tag is opt-out, and the group menu must not sit on transparency.
expect(client.includes('out.tags = raw.tags !== false'), 'the original-name tag switch is not persisted');
expect(client.includes('counts: false'), 'group member counts no longer default to off');
expect(client.includes('out.counts = raw.counts === true'), 'the group-count switch is not persisted');
expect(
  client.includes("t('layoutCounts')") &&
    client.includes("countsOn ? h('span', { className: 'dpc-count' }, String(members.length)) : null"),
  'the group count is not behind its master switch',
);
expect(
  client.includes('count: plan.prefs.counts === true ? shown.length : null') &&
    client.includes('counts: plan.prefs.counts === true') &&
    client.includes('if (block.count !== null)'),
  'the sidebar separator count is not behind the same switch',
);
expect(/\.dpc-nameTag\{[^}]*pointer-events:none/.test(client), 'the original-name tag can intercept clicks');
expect(pkg.scripts && String(pkg.scripts.check).includes('names-smoke'), 'npm run check no longer runs the names gate');

// The two-pane tree replaces the separate list and group picker. The left pane
// is only the ungrouped set; all grouping happens by dropping a row on the right.
expect(
  client.includes("className: 'dpc-treeGrid'") &&
    client.includes("className: 'dpc-pane dpc-pane--plugins'") &&
    client.includes("className: 'dpc-pane dpc-pane--groups'"),
  'the settings page lost its two-pane tree',
);
expect(
  client.includes('if (id !== PANEL_KEY) hiddenIds.add(id);') &&
    client.includes('const keep = loose.filter((id) => id === PANEL_KEY);') &&
    client.includes("blocks.push({ id: '', name: '', ids: keep });"),
  'ungrouped rows are no longer staged away from the sidebar',
);
expect(
  client.includes('function moveRowToGroup(rowId, groupId, beforeId)') &&
    client.includes('const before = beforeId && beforeId !== rowId ? order.indexOf(beforeId) : -1') &&
    client.includes('const groupId = assign[targetId] || \'\'') &&
    client.includes('moveRowToGroup(fromId, groupId, beforeId)'),
  'row drag no longer moves order and assign in one commit',
);
expect(
  client.includes("...dragTarget('row', id") &&
    client.includes("...dragTarget('plugins', '@plugins'") &&
    client.includes('if (!source || !accept.includes(source.kind)) return;') &&
    client.includes('event.stopPropagation();'),
  'tree drops lost their source guard or nested-event isolation',
);
expect(
  client.includes("drag.kind === 'row' && drag.from === id ? 'true' : 'false'") &&
    client.includes("drag.kind === 'group' && drag.from === group.id ? 'true' : 'false'"),
  'dragged tree rows no longer mark their source',
);
expect(
  client.includes("mode: 'split'") &&
    client.includes('event.clientY > box.top + box.height / 2') &&
    client.includes("onDrop: (from, kind, dropped) => dropRowOnRow(from, id, dropped === 'after')"),
  'the row target no longer picks an insertion side from the pointer',
);
expect(
  client.includes('event.dataTransfer.setDragImage(ghost, 20, 18)') &&
    client.includes("node.closest('li.dpc-row')") &&
    client.includes("group.querySelector('.dpc-groupHead')"),
  'the drag ghost is not a full row/group header',
);
expect(
  client.includes("'data-drop': dropMode") &&
    client.includes("'data-drop': beforeGroup ? 'before' : 'false'") &&
    client.includes("dropSlot('group-drop-' + group.id)") &&
    client.includes("dropSlot('plugins-drop')"),
  'the tree no longer renders a drop line or an append slot',
);
expect(
  /\.dpc-row\[data-drop="before"\]::before/.test(client) &&
    /\.dpc-row\[data-drop="after"\]::after/.test(client) &&
    /\.dpc-dropSlot\{[^}]*border:1px dashed/.test(client),
  'the insertion line or append slot lost its styling',
);
expect(
  !client.includes('GroupPicker') && !client.includes('dpc-picker') && !client.includes('dpc-menu'),
  'the old group picker survived the tree refactor',
);
expect(
  /\.dpc-treeGrid\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.15fr\)/.test(client) &&
    /@container \(max-width:720px\)\{[^}]*\.dpc-treeGrid\{grid-template-columns:1fr\}/.test(client),
  'the tree lost its desktop columns or its narrow-dialog stacking rule',
);
expect(
  client.includes("props.name === 'grip'") &&
    client.includes("h('circle', { key: 'g' + index, cx, cy, r: 1.6, fill: 'currentColor' })") &&
    /\.dpc-grip\{[^}]*width:16px[^}]*height:16px/.test(client),
  'the drag handle collapsed back into invisible sub-pixel dots',
);
expect(
  /\.dpc-groupHead \.dpc-input\{[^}]*flex:0 1 auto[^}]*max-width:260px[^}]*field-sizing:content/.test(client),
  'the group name input stretches like a form field again',
);
expect(
  client.includes('const [groupFold, setGroupFold] = React.useState({});') &&
    client.includes("const collapsed = groupHidden ? groupFold[group.id] !== false : groupFold[group.id] === true;") &&
    client.includes("'data-collapsed': collapsed ? 'true' : 'false'") &&
    client.includes("collapsed ? t('expandGroup') : t('collapseGroup')"),
  'a hidden group no longer folds to its collapsed default',
);
expect(
  /collapsed\s*\?\s*null\s*:\s*h\(/.test(client) &&
    client.includes("if (collapsed) setGroupFold((prev) => ({ ...prev, [group.id]: false }));"),
  'a collapsed group still mounts its children, or a drop does not open it',
);
// Auto filing only owns entries the user has never positioned. Every drag and a
// group deletion writes a manual lock, and an old file infers it from autoFiled.
expect(
  client.includes('out.autoSkip = uniqueIds(raw.autoSkip, LIMITS.autoSkip);') &&
    client.includes('(prefs.autoSkip || []).length > 0 ||') &&
    client.includes('function autoSkipSet(prefs = prefsNow())') &&
    client.includes('if (!groupId || !groups.has(groupId)) skip.add(id);'),
  'manual classification locks lost their persistence or legacy inference',
);
expect(
  client.includes('autoSkip.add(rowId);') &&
    client.includes('autoSkip.add(panelId);') &&
    client.includes('const skip = autoSkipSet(prefs);') &&
    client.includes('known.has(id) && (all || !skip.has(id))') &&
    client.includes('const candidates = all ? entries : entries.filter((entry) => !skip.has(entry.id));') &&
    client.includes('entries: candidates.map((entry) => ({ id: entry.id, label: entry.label })),') &&
    client.includes('!filed.has(entry.id) && !skip.has(entry.id)') &&
    client.includes('prefs.autoFiled, prefs.autoSkip'),
  'manual entries can still reach or survive a classification run',
);
expect(
  client.includes("onClick: () => classifyNow('new')") &&
    client.includes("onClick: () => classifyNow('all')") &&
    client.includes("className: 'dpc-link dpc-link--danger'") &&
    client.includes('autoAgainAllHint') &&
    client.includes('.dpc-link--danger{color:var(--dsw-alias-state-error-primary,#b45454)}') &&
    client.includes('.dpc-autoActions{width:100%;justify-content:flex-end}'),
  'the two classify modes are missing from the UI or its narrow layout',
);
expect(
  client.includes('const toggleGroupVisibility = (groupId) => {') &&
    client.includes('delete next[groupId];') &&
    client.includes('toggleGroupHidden(groupId);') &&
    client.includes('() => toggleGroupVisibility(group.id)'),
  'the eye no longer resets the local fold state before toggling visibility',
);
expect(
  /\.dpc-treeCaret\[aria-expanded="true"\] \.dpc-ico\{transform:rotate\(90deg\)\}/.test(client),
  'the caret does not point down when the group is open',
);


// A group switch is a second, independent hidden axis: the engine must union it
// with the per-row list, and "show all" must clear both.
expect(
  client.includes('out.hiddenGroups = uniqueIds(raw.hiddenGroups, LIMITS.groups)'),
  'the group-hidden list is not sanitized',
);
expect(
  client.includes('commit({ ...prefsNow(), hidden: [], hiddenGroups: [] })'),
  'show-all no longer clears group-hidden rows',
);
expect(
  client.includes('const hiddenIds = hiddenIdsOf(prefs, order)') &&
    client.includes('const hiddenIds = hiddenIdsOf(prefs, ordered)'),
  'the engine and the manager no longer share one hidden-id set',
);
expect(
  (client.match(/plan\.hiddenIds/g) || []).length >= 5,
  'the engine still hides rows from the per-row list only',
);
expect(
  client.includes('const hideable = members.filter((id) => id !== PANEL_KEY)') &&
    client.includes('hideable.length === 0') &&
    client.includes("t('showGroup')"),
  'a group row lost its eye switch or its fixed-row guard',
);
expect(
  client.indexOf("t('deleteGroup')") >= 0 &&
    client.indexOf("t('deleteGroup')") < client.indexOf("t('showGroup')"),
  'the group eye is not the last action in the row',
);

const readmeShots = [
  ...new Set([...readme.matchAll(/assets\/screenshot-[\w-]+\.png/g)].map((match) => match[0])),
];
expect(
  readme.includes('dsh-panel-control@' + pkg.version),
  'README install version and package.json version disagree',
);
expect(readmeShots.length >= 2, 'README no longer references both screenshots');
for (const shot of readmeShots) {
  expect(existsSync(new URL('../' + shot, import.meta.url)), 'README references a missing screenshot: ' + shot);
}
expect(
  readme.includes('/v' + pkg.version + '/assets/screenshot-panel.png'),
  'README screenshots are not pinned to the release tag',
);
expect(Array.isArray(screenshots) && screenshots.length >= 2, 'screenshots.json lost its screenshot list');
for (const shot of screenshots) {
  expect(existsSync(new URL('../' + shot, import.meta.url)), 'screenshots.json references a missing file: ' + shot);
}
expect(
  String(pkg.description || '').includes('侧栏'),
  'package.json description is missing the Chinese sidebar summary',
);

expect(client.includes("const BUILD_STAMP = 'dsh-panel-control/" + pkg.version + "'"), 'BUILD_STAMP and package.json version disagree');
expect(pkg.scripts && String(pkg.scripts.check).includes('layout-smoke'), 'npm run check no longer runs this gate');
expect(pkg.scripts && String(pkg.scripts.check).includes('bridge-smoke'), 'npm run check no longer runs the bridge gate');
expect(/\[data-dpc-list\]\{[^}]*overflow-y:auto/.test(client), 'the panel list is not scrollable');
expect(/\[data-dpc-list\]\{[^}]*max-height:max\(120px,var\(--dpc-panellist-max,45vh\)\)/.test(client), 'the panel list lost its height cap');
expect(/\[data-dpc-region\]\{[^}]*min-height/.test(client), 'the region below the list lost its floor');

expect(/\.dpc-layoutRow:first-of-type\{[^}]*border-top:0/.test(client), 'the first layout row has a hairline touching the card hint');
expect(/\.dpc-layout > \.dpc-note\{[^}]*margin:6px 0 10px/.test(client), 'the card hint lost its gap above the rows');
expect(/\.dpc-layoutActions\{[^}]*margin-top:12px/.test(client), 'the collapse/expand actions lost their separation');
if (problems.length) {
  console.error('layout-smoke: ' + problems.length + ' problem(s)');
  for (const problem of problems) console.error(' - ' + problem);
  process.exit(1);
}
console.log('layout-smoke: ok (' + pkg.version + ')');
