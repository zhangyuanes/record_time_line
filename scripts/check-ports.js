const net = require("net");

const ports = [8787, 5173];

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.destroy();
      resolve({ port, inUse: true });
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve({ port, inUse: false });
    });
    socket.once("error", () => resolve({ port, inUse: false }));
    socket.connect(port, "127.0.0.1");
  });
}

async function main() {
  const results = await Promise.all(ports.map(checkPort));
  for (const item of results) {
    const state = item.inUse ? "IN_USE" : "AVAILABLE";
    console.log(`${item.port}: ${state}`);
  }
}

main();
