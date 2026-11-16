// Hidden input for terminals. Nothing typed or pasted is echoed; a dot per
// character shows the paste arrived. A paste into an empty field submits on
// its own, no Enter needed; anything typed by hand waits for Enter.
import readline from 'node:readline';
import { KeepKeysError, EXIT } from './errors.js';

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
const FAST_MS = 20; // characters closer together than this were not typed by hand
const PASTE_RUN = 8;
const PASTE_QUIET_MS = 250;

export function readStdin(input = process.stdin) {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', (c) => (data += c));
    input.on('end', () => resolve(data.replace(/\r?\n$/, '')));
    input.on('error', reject);
  });
}

/**
 * Reads one secret from a TTY without echo.
 * `onCtrlV` is called when the terminal sends a raw Ctrl+V instead of pasting
 * (old Windows consoles); it should return the clipboard text or null.
 */
export function readHidden(question, { input = process.stdin, output = process.stderr, onCtrlV = null } = {}) {
  return new Promise((resolve, reject) => {
    let value = '';
    let inPaste = false;
    let beforePaste = '';
    let pending = '';
    let burstTimer = null;
    // Without bracketed-paste markers (e.g. Windows consoles) a paste shows up
    // as characters arriving faster than anyone types. Track that run.
    let lastCharAt = 0;
    let runStart = 0;
    let runLength = 0;

    const render = () => {
      const n = [...value].length;
      const dots = '•'.repeat(Math.min(n, 32));
      const count = n > 32 ? ` (${n} chars)` : '';
      output.write(`\r\x1b[K${question}${dots}${count}`);
    };

    const finish = (err) => {
      clearTimeout(burstTimer);
      input.removeListener('data', onData);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      output.write('\x1b[?2004l\n');
      if (err) reject(err);
      else resolve(value);
    };

    const finishAfterPaste = () => {
      render();
      finish();
    };

    const onData = (chunk) => {
      clearTimeout(burstTimer);
      const s = pending + chunk;
      pending = '';
      let i = 0;
      while (i < s.length) {
        if (s.startsWith(PASTE_START, i)) {
          inPaste = true;
          beforePaste = value;
          i += PASTE_START.length;
          continue;
        }
        if (s.startsWith(PASTE_END, i)) {
          inPaste = false;
          i += PASTE_END.length;
          // Keep line breaks inside the paste (PEM keys, JSON), not at its end.
          value = value.replace(/\n+$/, '');
          if (!beforePaste && value.trim()) return finishAfterPaste();
          continue;
        }
        const ch = s[i];
        if (ch === '\x1b') {
          // Possibly the start of a paste marker split across chunks.
          const rest = s.slice(i);
          if (PASTE_START.startsWith(rest) || PASTE_END.startsWith(rest)) {
            pending = rest;
            break;
          }
          // Skip other escape sequences (arrow keys etc.).
          const m = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(rest);
          i += m ? m[0].length : 1;
          continue;
        }
        i++;
        if (inPaste) {
          if (ch === '\r') {
            if (s[i] !== '\n') value += '\n'; // a lone CR is a line break too
          } else {
            value += ch;
          }
          continue;
        }
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\x03') return finish(new KeepKeysError('cancelled', EXIT.CANCELLED));
        if (ch === '\x04' && !value) return finish(new KeepKeysError('cancelled', EXIT.CANCELLED));
        if (ch === '\x7f' || ch === '\b') {
          value = [...value].slice(0, -1).join('');
          runLength = 0;
        } else if (ch === '\x15') {
          value = '';
          runLength = 0;
        } else if (ch === '\x16') {
          const wasEmpty = !value;
          const clip = onCtrlV?.();
          if (clip) {
            value += clip.replace(/\r?\n$/, '');
            if (wasEmpty) return finishAfterPaste();
          }
        } else if (ch >= ' ') {
          const t = Date.now();
          if (t - lastCharAt > FAST_MS) {
            runStart = value.length;
            runLength = 0;
          }
          lastCharAt = t;
          value += ch;
          runLength++;
        }
      }
      if (runLength >= PASTE_RUN && runStart === 0) burstTimer = setTimeout(finishAfterPaste, PASTE_QUIET_MS);
      render();
    };

    output.write('\x1b[?2004h');
    render();
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

/**
 * Asks a yes/no question with a single key press, without echo. A paste (a
 * burst of characters, or bracketed paste) is never shown: someone pasting
 * the next key too early would otherwise see it printed on screen. It is
 * thrown away and the question is asked again.
 */
export function confirm(question, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) return confirmLine(question, { input, output });
  return new Promise((resolve, reject) => {
    const finish = (answer, shown, err) => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write(`${shown}\x1b[?2004l\n`);
      if (err) reject(err);
      else resolve(answer);
    };
    const onData = (chunk) => {
      const s = String(chunk);
      if (s === '\x03') return finish(false, '', new KeepKeysError('cancelled', EXIT.CANCELLED));
      if (s === 'y' || s === 'Y') return finish(true, 'y');
      if (s === 'n' || s === 'N' || s === '\r' || s === '\n' || s === '\x1b' || s === '\x04') return finish(false, 'n');
      if (s.length > 1 && !/^\x1b\[[0-9;]*[A-Za-z~]$/.test(s)) {
        output.write(`\r\x1b[K  (ignored a paste: nothing was shown or saved)\n${question} [y/N] `);
      }
    };
    output.write(`\x1b[?2004h${question} [y/N] `);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.on('data', onData);
    input.resume();
  });
}

async function confirmLine(question, { input, output }) {
  const rl = readline.createInterface({ input, output, terminal: false });
  try {
    output.write(`${question} [y/N] `);
    const answer = await new Promise((resolve) => {
      rl.once('line', resolve);
      rl.once('close', () => resolve(''));
    });
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
