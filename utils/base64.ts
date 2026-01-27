const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

function cleanBase64(input: string): string {
  return input.replace(/[\r\n\s]/g, '');
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const b64 = cleanBase64(base64);

  // Use platform atob when available.
  const atobFn = (globalThis as any)?.atob as ((s: string) => string) | undefined;
  if (typeof atobFn === 'function') {
    const binary = atobFn(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Pure JS base64 decode (no atob required)
  let str = b64;
  // Pad
  while (str.length % 4 !== 0) str += '=';

  const outputLen = Math.floor((str.length * 3) / 4) - (str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0);
  const out = new Uint8Array(outputLen);

  let p = 0;
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str.charAt(i));
    const enc2 = chars.indexOf(str.charAt(i + 1));
    const enc3 = chars.indexOf(str.charAt(i + 2));
    const enc4 = chars.indexOf(str.charAt(i + 3));

    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;

    out[p++] = chr1;
    if (enc3 !== 64 && p < out.length) out[p++] = chr2;
    if (enc4 !== 64 && p < out.length) out[p++] = chr3;
  }

  return out;
}

export function base64ToUtf8String(base64: string): string {
  const bytes = base64ToUint8Array(base64);
  const td = (globalThis as any)?.TextDecoder ? new TextDecoder('utf-8') : null;
  if (td) return td.decode(bytes);
  // Fallback: best-effort ASCII/latin1
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const btoaFn = (globalThis as any)?.btoa as ((s: string) => string) | undefined;
  if (typeof btoaFn === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoaFn(binary);
  }

  // Pure JS base64 encode
  let output = '';
  let i = 0;
  while (i < bytes.length) {
    const chr1 = bytes[i++];
    const chr2 = i < bytes.length ? bytes[i++] : NaN;
    const chr3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = chr1 >> 2;
    const enc2 = ((chr1 & 3) << 4) | (Number.isNaN(chr2) ? 0 : (chr2 as number) >> 4);
    const enc3 = Number.isNaN(chr2)
      ? 64
      : (((chr2 as number) & 15) << 2) | (Number.isNaN(chr3) ? 0 : (chr3 as number) >> 6);
    const enc4 = Number.isNaN(chr3) ? 64 : (chr3 as number) & 63;

    output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
  }
  return output;
}

