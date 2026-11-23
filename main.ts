// tiny-stack-vm: interpreter for make.fun's tiny stack ISA v1.
// Runs each <id> in the input dir (program.bin + input.bin) and writes
// <output>/<id>/stdout.bin and <output>/<id>/exit.txt.
const fs = require("node:fs");
const path = require("node:path");
const IN_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// Exit and every trap unwind by throwing the final exit code (0..255).
function run(P, I) {
  const S = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const O = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, steps = 0, inAt = 0, ol = 0;
  const L = P.length;
  try {
    for (;;) {
      if (steps >= 1000000) throw 10;
      if (pc < 0 || pc >= L) throw 9;
      const op = P[pc];
      steps++;
      switch (op) {
        case 0x00: throw 0;
        case 0x01: {
          if (pc + 2 > L) throw 9;
          if (sp >= 256) throw 3;
          const b = P[pc + 1];
          S[sp++] = b < 128 ? b : b - 256; pc += 2; break;
        }
        case 0x02:
          if (pc + 5 > L) throw 9;
          if (sp >= 256) throw 3;
          S[sp++] = P[pc + 1] | (P[pc + 2] << 8) | (P[pc + 3] << 16) | (P[pc + 4] << 24);
          pc += 5; break;
        case 0x03:
          if (sp < 1) throw 2;
          sp--; pc++; break;
        case 0x04:
          if (sp < 1) throw 2;
          if (sp >= 256) throw 3;
          S[sp] = S[sp - 1]; sp++; pc++; break;
        case 0x05: {
          if (sp < 2) throw 2;
          const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; pc++; break;
        }
        case 0x06:
          if (sp < 2) throw 2;
          if (sp >= 256) throw 3;
          S[sp] = S[sp - 2]; sp++; pc++; break;
        case 0x07: {
          if (sp < 3) throw 2;
          const t = S[sp - 3];
          S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = t; pc++; break;
        }
        case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
        case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
        case 0x1e: case 0x20: case 0x21: case 0x22: {
          if (sp < 2) throw 2;
          if (op >= 0x13 && op <= 0x16 && S[sp - 1] === 0) throw 4;
          const b = S[--sp], a = S[sp - 1];
          switch (op) {
            case 0x10: S[sp - 1] = a + b; break;
            case 0x11: S[sp - 1] = a - b; break;
            case 0x12: S[sp - 1] = Math.imul(a, b); break;
            case 0x13: S[sp - 1] = Math.trunc(a / b); break;
            case 0x14: S[sp - 1] = a % b; break;
            case 0x15: S[sp - 1] = Math.trunc((a >>> 0) / (b >>> 0)); break;
            case 0x16: S[sp - 1] = (a >>> 0) % (b >>> 0); break;
            case 0x18: S[sp - 1] = a & b; break;
            case 0x19: S[sp - 1] = a | b; break;
            case 0x1a: S[sp - 1] = a ^ b; break;
            case 0x1c: S[sp - 1] = a << (b & 31); break;
            case 0x1d: S[sp - 1] = a >> (b & 31); break;
            case 0x1e: S[sp - 1] = a >>> (b & 31); break;
            case 0x20: S[sp - 1] = a === b ? 1 : 0; break;
            case 0x21: S[sp - 1] = a < b ? 1 : 0; break;
            case 0x22: S[sp - 1] = (a >>> 0) < (b >>> 0) ? 1 : 0; break;
          }
          pc++; break;
        }
        case 0x17:
          if (sp < 1) throw 2;
          S[sp - 1] = -S[sp - 1]; pc++; break;
        case 0x1b:
          if (sp < 1) throw 2;
          S[sp - 1] = ~S[sp - 1]; pc++; break;
        case 0x30: case 0x31: case 0x32: {
          if (pc + 3 > L) throw 9;
          let off = P[pc + 1] | (P[pc + 2] << 8);
          if (off >= 32768) off -= 65536;
          pc += 3;
          if (op === 0x30) pc += off;
          else {
            if (sp < 1) throw 2;
            const v = S[--sp];
            if ((op === 0x31 && v === 0) || (op === 0x32 && v !== 0)) pc += off;
          }
          break;
        }
        case 0x33:
          if (pc + 3 > L) throw 9;
          if (cp >= 64) throw 7;
          C[cp++] = pc + 3; pc = P[pc + 1] | (P[pc + 2] << 8); break;
        case 0x34:
          if (cp === 0) throw 8;
          pc = C[--cp]; break;
        case 0x40: {
          if (sp < 1) throw 2;
          const a = S[sp - 1];
          if (a < 0 || a > 255) throw 6;
          S[sp - 1] = M[a]; pc++; break;
        }
        case 0x41: {
          if (sp < 2) throw 2;
          const a = S[sp - 1];
          if (a < 0 || a > 255) throw 6;
          M[a] = S[sp - 2]; sp -= 2; pc++; break;
        }
        case 0x50: {
          if (sp < 1) throw 2;
          const s = String(S[--sp]);
          if (ol + s.length > 65536) throw 11;
          for (let i = 0; i < s.length; i++) O[ol++] = s.charCodeAt(i);
          pc++; break;
        }
        case 0x51:
          if (sp < 1) throw 2;
          if (ol + 1 > 65536) throw 11;
          O[ol++] = S[--sp] & 255; pc++; break;
        case 0x52:
          if (sp >= 256) throw 3;
          S[sp++] = inAt < I.length ? I[inAt++] : -1; pc++; break;
        case 0x53:
          if (sp < 1) throw 2;
          throw S[--sp] & 255;
        default: throw 5;
      }
    }
  } catch (code) {
    return { out: Buffer.from(O.subarray(0, ol)), code };
  }
}

for (const ent of fs.readdirSync(IN_DIR, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const dir = path.join(IN_DIR, ent.name);
  if (!fs.existsSync(path.join(dir, "program.bin"))) continue;
  const prog = fs.readFileSync(path.join(dir, "program.bin"));
  let input = Buffer.alloc(0);
  try { input = fs.readFileSync(path.join(dir, "input.bin")); } catch {}
  const r = run(prog, input);
  const outDir = path.join(OUT_DIR, ent.name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stdout.bin"), r.out);
  fs.writeFileSync(path.join(outDir, "exit.txt"), r.code + "\n");
}
