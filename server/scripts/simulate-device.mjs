// Pretends to be a ZKTeco/eSSL biometric machine talking ADMS to our server — for testing the
// attendance module before (or without) the real machine.
//
//   BASE_URL=http://localhost:5000 node scripts/simulate-device.mjs                 # handshake only
//   BASE_URL=… node scripts/simulate-device.mjs 12 "2026-10-10 08:03:00" 12 "2026-10-10 17:12:30"
//   BASE_URL=… SN=MGM-TEST-01 node scripts/simulate-device.mjs --today 12 13       # in at 08:0x, out at 17:1x
//
// A new serial first shows up in Settings → Attendance as "waiting for approval"; until it is
// approved the server answers 403 and a real machine keeps its punches and retries.

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const SN = process.env.SN || 'MGM-SIMULATOR';
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function punchesFromArgs(args) {
  if (args[0] === '--today') {
    const out = [];
    for (const pin of args.slice(1)) {
      const day = new Date();
      const jitter = () => Math.floor(Math.random() * 10);
      out.push([pin, stamp(new Date(day.setHours(8, jitter(), jitter())))]);
      out.push([pin, stamp(new Date(day.setHours(17, 10 + jitter(), jitter())))]);
    }
    return out;
  }
  if (args.length % 2) throw new Error('Pass punches as pairs: <machine number> "<YYYY-MM-DD HH:MM:SS>"');
  const out = [];
  for (let i = 0; i < args.length; i += 2) out.push([args[i], args[i + 1]]);
  return out;
}

async function main() {
  const punches = punchesFromArgs(process.argv.slice(2));

  const hello = await fetch(`${BASE}/iclock/cdata?SN=${encodeURIComponent(SN)}&options=all&pushver=2.4.1&language=69`);
  const helloText = await hello.text();
  console.log(`handshake → ${hello.status}\n${helloText}\n`);
  if (hello.status === 403) {
    console.log(`Approve machine "${SN}" in Settings → Attendance, then run this again.`);
    return;
  }
  if (!punches.length) return;

  // Real machines send: PIN \t time \t status \t verify \t workcode \t reserved…
  const body = punches.map(([pin, time]) => `${pin}\t${time}\t0\t1\t0\t0\t0`).join('\n');
  const up = await fetch(`${BASE}/iclock/cdata?SN=${encodeURIComponent(SN)}&table=ATTLOG&Stamp=9999`, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body,
  });
  console.log(`ATTLOG (${punches.length} punches) → ${up.status} ${await up.text()}`);
  for (const [pin, time] of punches) console.log(`  ${pin}\t${time}`);

  const poll = await fetch(`${BASE}/iclock/getrequest?SN=${encodeURIComponent(SN)}`);
  console.log(`getrequest → ${poll.status} ${await poll.text()}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
