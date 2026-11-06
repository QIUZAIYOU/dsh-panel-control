// Static gate for the sidebar layout guard (discussion #12083).
//
// The guard is CSS plus a handful of attributes the engine writes; neither is
// reachable from a node unit test because client.js only loads inside the page
// module loader. These assertions keep the pieces the runtime check proved are
// necessary from silently disappearing in a refactor.
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const client = read('client.js');
const pkg = JSON.parse(read('package.json'));
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
