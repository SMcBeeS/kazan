const fs = require('fs');
const P = 'f:/Anime gate/AnimeGate-main/src/components/layout/HeaderBar.tsx';
const src0 = fs.readFileSync(P, 'utf8');
const NL = src0.includes('\r\n') ? '\r\n' : '\n';
let s = src0;

const report = (tag) => console.log(tag, 'len=' + s.length,
  'crlf=' + (s.match(/\r\n/g) || []).length,
  'bellJsx=' + s.includes('<NotificationBell'),
  'importBell=' + s.includes("import { NotificationBell }"));
report('BEFORE');
if (s.includes('<NotificationBell') && s.includes("import { NotificationBell }")) {
  console.log('already integrated, nothing to do');
  process.exit(0);
}

// 1) import
if (s.includes("import { NotificationBell }")) {
  // import already present; ensure it is not duplicated
} else {
  const impLong = "from '../icons'";
  const impIdx = s.lastIndexOf(impLong);
  if (impIdx < 0) throw new Error('no ../icons import found');
  const impLineEnd = s.indexOf('\n', impIdx);
  s = s.slice(0, impLineEnd + 1) + "import { NotificationBell } from '../Notifications'" + NL + s.slice(impLineEnd + 1);
}

// 2) drop legacy placeholder array line
s = s.replace(/^const notifications = \[\] as[^\n]*\r?\n/m, '');

// 3) replace the bell button subtree. The trigger is the only element with setNotifOpen in onClick.
const anchor = 'onClick={() => setNotifOpen';
const ai = s.lastIndexOf(anchor);
if (ai < 0) throw new Error('bell anchor not found');
const openTag = s.lastIndexOf('<button', ai);
if (openTag < 0) throw new Error('open button tag not found');

const tagEnd = s.indexOf('>', openTag); // end of <button ...>
const openLineStart = s.lastIndexOf('\n', openTag) + 1;

// scan for the matching </button>
let depth = 1;
let pos = tagEnd;
let closeTagStart = -1;
while (pos < s.length) {
  const lt = s.indexOf('<', pos + 1);
  if (lt < 0) break;
  const te = s.indexOf('>', lt);
  if (te < 0) break;
  const tag = s.slice(lt, te + 1);
  pos = te;
  if (tag.startsWith('</button')) { depth--; if (depth === 0) { closeTagStart = lt; break; } }
  else if (tag.startsWith('<button')) depth++;
}
if (closeTagStart < 0) throw new Error('close </button> not found');
const btnEnd = closeTagStart + 9; // '</button>' length

let start = openLineStart;
let end = btnEnd;

// if wrapped in {notifOpen && ( ... )}, expand to include the whole conditional
const before = s.slice(Math.max(openLineStart - 90), openLineStart);
const wsm = before.match(/\{ *notifOpen *&& *\($/);
if (wsm) {
  start = openLineStart - before.length + before.lastIndexOf('{');
  const after = s.slice(btnEnd, btnEnd + 60);
  const em = after.match(/\r?\n[^\r\n]*\)\}/);
  if (em) end = btnEnd + em[0].length;
  else throw new Error('conditional close not found');
}

const replacement = '                  <NotificationBell open={notifOpen} onToggle={setNotifOpen} boxRef={notifBoxRef} />';
s = s.slice(0, start) + replacement + s.slice(end);

report('AFTER');
fs.writeFileSync(P, s);
const k = s.indexOf('<NotificationBell');
console.log('---context---');
console.log(s.slice(k - 240, k + 200).replace(/\r\n/g, '\\n'));