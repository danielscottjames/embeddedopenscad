export function decodeAndRethrowErrorFromOpenSCAD(error: unknown, scad: OpenSCAD.Instance): never {
    // First try to use the built-in formatException if available
    if (typeof error === "number") {
        if (error == 1) {
            const lastError = scad.getLastError?.();
            if (lastError) {
                throw lastError;
            }
        }

        if (scad.formatException) {
            try {
                const formattedError = scad.formatException(error);
                if (formattedError && typeof formattedError === "string" && formattedError !== String(error)) {
                    throw formattedError;
                }
            } catch (e) {
                // Continue trying to parse the error...
            }
        }

        throw new Error(`OpenSCAD returned non-zero error code: ${error}. Check output for details.`);
    }

    if (error instanceof scad.FS.ErrnoError) {
        throw new Error(`WASM File System Error: ${error.errno} (${WASI_ERRNO[error.errno as 0]})`);
    }

    throw error;
}

// This isn't very safe/sane. Prefer to get scad.formatException enabled.
// But leaving this here for debugging purposes.
function decodeAbortString(inst: OpenSCAD.Instance, ptr: number) {
    if (!ptr) return '(null)';
    ptr >>>= 0;                                 // force unsigned

    const H8 = inst.HEAPU8;
    const H32 = inst.HEAPU32;
    const td = new TextDecoder('utf-8');

    /* ---------- follow up to TWO indirections -------------------- */
    for (let hop = 0; hop < 2; ++hop) {
        if (ptr > 0 && ptr < H8.length) {
            const p2 = H32[ptr >> 2] >>> 0;
            if (p2 > 0 && p2 < H8.length && p2 !== ptr) {
                ptr = p2;                     // one hop deeper
                continue;
            }
        }
        break;                            // not a valid hop → stop
    }

    /* ---------- scan to string boundaries ----------------------- */
    let start = ptr;
    while (start > 0 && H8[start - 1] !== 0) --start;

    let end = ptr;
    while (end < H8.length && H8[end] !== 0) ++end;

    return td.decode(H8.subarray(start, end));
}

// Numeric WASI errno  →  POSIX error macro   (snapshot-preview1)
export const WASI_ERRNO = Object.freeze({
  0:  'ESUCCESS',
  1:  'E2BIG',
  2:  'EACCES',
  3:  'EADDRINUSE',
  4:  'EADDRNOTAVAIL',
  5:  'EAFNOSUPPORT',
  6:  'EAGAIN',
  7:  'EALREADY',
  8:  'EBADF',
  9:  'EBADMSG',
  10: 'EBUSY',
  11: 'ECANCELED',
  12: 'ECHILD',
  13: 'ECONNABORTED',
  14: 'ECONNREFUSED',
  15: 'ECONNRESET',
  16: 'EDEADLK',
  17: 'EDESTADDRREQ',
  18: 'EDOM',
  19: 'EDQUOT',
  20: 'EEXIST',
  21: 'EFAULT',
  22: 'EFBIG',
  23: 'EHOSTUNREACH',
  24: 'EIDRM',
  25: 'EILSEQ',
  26: 'EINPROGRESS',
  27: 'EINTR',
  28: 'EINVAL',
  29: 'EIO',
  30: 'EISCONN',
  31: 'EISDIR',
  32: 'ELOOP',
  33: 'EMFILE',
  34: 'EMLINK',
  35: 'EMSGSIZE',
  36: 'EMULTIHOP',
  37: 'ENAMETOOLONG',
  38: 'ENETDOWN',
  39: 'ENETRESET',
  40: 'ENETUNREACH',
  41: 'ENFILE',
  42: 'ENOBUFS',
  43: 'ENODEV',
  44: 'ENOENT',
  45: 'ENOEXEC',
  46: 'ENOLCK',
  47: 'ENOLINK',
  48: 'ENOMEM',
  49: 'ENOMSG',
  50: 'ENOPROTOOPT',
  51: 'ENOSPC',
  52: 'ENOSYS',
  53: 'ENOTCONN',
  54: 'ENOTDIR',
  55: 'ENOTEMPTY',
  56: 'ENOTRECOVERABLE',
  57: 'ENOTSOCK',
  58: 'ENOTSUP',
  59: 'ENOTTY',
  60: 'ENXIO',
  61: 'EOVERFLOW',
  62: 'EOWNERDEAD',
  63: 'EPERM',
  64: 'EPIPE',
  65: 'EPROTO',
  66: 'EPROTONOSUPPORT',
  67: 'EPROTOTYPE',
  68: 'ERANGE',
  69: 'EROFS',
  70: 'ESPIPE',
  71: 'ESRCH',
  72: 'ESTALE',
  73: 'ETIMEDOUT',
  74: 'ETXTBSY',
  75: 'EXDEV',
  76: 'ENOTCAPABLE',     // WASI capability-model extension
  77: 'ESHUTDOWN',       // socket shutdown after send
  78: 'EMEMVIOLATION',   // memory access violation
  79: 'EUNKNOWN'         // catch-all (“unknown”)
});
