
const net = require('net');

const args = process.argv.slice(2);
const host = args[0] || process.env.PGHOST || '127.0.0.1';
const port = parseInt(args[1] || process.env.PGPORT || '5432', 10);
const timeoutMs = parseInt(
  args[2] || process.env.WAIT_TIMEOUT_MS || '30000',
  10
);

function check() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let called = false;
    socket.setTimeout(2000);
    socket.once('error', () => {
      if (!called) {
        called = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once('timeout', () => {
      if (!called) {
        called = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host, () => {
      if (!called) {
        called = true;
        socket.end();
        resolve(true);
      }
    });
  });
}

(async () => {
  const start = Date.now();
  process.stdout.write(`Waiting for Postgres at ${host}:${port}`);
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await check();
    if (ok) {
      console.log('\nPostgres is accepting connections');
      process.exit(0);
    }
    // wait 1s
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
    process.stdout.write('.');
  }
  console.error(`\nTimed out waiting for Postgres at ${host}:${port}`);
  process.exit(2);
})();
