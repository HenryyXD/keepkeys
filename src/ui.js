const useColor = (stream) => stream.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

function paint(code, stream) {
  return (s) => (useColor(stream) ? `\x1b[${code}m${s}\x1b[0m` : s);
}

export const color = {
  green: paint(32, process.stdout),
  red: paint(31, process.stdout),
  yellow: paint(33, process.stderr),
  dim: paint(2, process.stdout),
  bold: paint(1, process.stdout),
};

export const err = (s = '') => process.stderr.write(`${s}\n`);
export const out = (s = '') => process.stdout.write(`${s}\n`);
export const warn = (s) => err(color.yellow(`  ! ${s}`));
