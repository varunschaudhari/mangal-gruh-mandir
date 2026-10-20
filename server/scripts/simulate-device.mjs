// Pretends to be a ZKTeco/eSSL biometric machine talking ADMS to our server — for testing the
// attendance module before (or without) the real machine.
//
//   BASE_URL=http://localhost:5000 node scripts/simulate-device.mjs                 # handshake only
//   BASE_URL=… node scripts/simulate-device.mjs 12 "2026-10-10 08:03:00" 12 "2026-10-10 17:12:30"
//   BASE_URL=… SN=MGM-TEST-01 node scripts/simulate-device.mjs --today 12 13       # in at 08:0x, out at 17:1x
//   PROTOCOL=fkweb BASE_URL=… node scripts/simulate-device.mjs --today 12          # a Team Office (FkWeb) machine
//
// A new serial first shows up in Settings → Attendance as "waiting for approval"; until it is
// approved the server refuses (403, or response_code ERROR for FkWeb) and a real machine keeps
// its punches and retries.

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

// FkWeb (Team Office…): POST /fkweb, what it is in headers, body = 4-byte length + JSON
async function fkweb(punches) {
  let trans = 0;
  const send = async (code, json) => {
    const text = Buffer.from(JSON.stringify(json)); const len = Buffer.alloc(4); len.writeUInt32LE(text.length + 1, 0);
    const res = await fetch(`${BASE}/fkweb`, {
      method: 'POST',
      headers: { request_code: code, dev_id: SN, trans_id: String(++trans), 'content-type': 'application/octet-stream' },
      body: Buffer.concat([len, text, Buffer.from([0])]),
    });
    return `${res.status} response_code=${res.headers.get('response_code')}`;
  };
  const poll = await send('receive_cmd', { fk_name: 'SIMULATOR', fk_info: { firmware: 'simulate-device.mjs' } });
  console.log(`receive_cmd → ${poll}`);
  if (poll.endsWith('ERROR')) {
    console.log(`Approve machine "${SN}" in Settings → Attendance, then run this again.`);
    return;
  }
  for (const [pin, time] of punches) {
    const ioTime = time.replace(/\D/g, '');   // "2026-10-10 08:03:00" → "20261010080300"
    console.log(`realtime_glog ${pin} ${time} → ${await send('realtime_glog', { user_id: pin.padStart(8, '0'), io_time: ioTime, verify_mode: 'FACE', io_mode: 1 })}`);
  }
}

async function main() {
  const punches = punchesFromArgs(process.argv.slice(2));
  if (process.env.PROTOCOL === 'fkweb') return fkweb(punches);

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
