export type TotpSettings = { secret: string; algorithm: string; digits: number; period: number };

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function decodeBase32(input: string): Uint8Array {
    const value = input.replace(/\s/g, '').toUpperCase().replace(/=+$/, '');
    if (!/^[A-Z2-7]+$/.test(value) || value.length > 1024) throw new Error('invalid_secret');
    let bits = 0, buffer = 0;
    const bytes: number[] = [];
    for (const char of value) {
        buffer = (buffer << 5) | alphabet.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >>> bits) & 255);
            buffer &= (1 << bits) - 1;
        }
    }
    if (!bytes.length || buffer !== 0 || [1, 3, 6].includes(value.length % 8)) throw new Error('invalid_secret');
    return new Uint8Array(bytes);
}

export function parseTotp(input: unknown, labelInput: unknown): TotpSettings & { label: string; issuer: string } {
    if (typeof input !== 'string' || input.length > 4096) throw new Error('invalid_secret');
    let secret = input.trim(), algorithm = 'SHA1', digits = 6, period = 30, issuer = '', uriLabel = '';
    if (secret.toLowerCase().startsWith('otpauth:')) {
        const uri = new URL(secret);
        if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || uri.username || uri.password || uri.port) throw new Error('invalid_secret');
        secret = uri.searchParams.get('secret') || '';
        algorithm = (uri.searchParams.get('algorithm') || 'SHA1').toUpperCase();
        digits = Number(uri.searchParams.get('digits') || 6);
        period = Number(uri.searchParams.get('period') || 30);
        uriLabel = decodeURIComponent(uri.pathname.slice(1));
        issuer = uri.searchParams.get('issuer') || uriLabel.split(':').slice(0, -1).join(':');
    }
    secret = secret.replace(/\s/g, '').toUpperCase().replace(/=+$/, '');
    decodeBase32(secret);
    const label = typeof labelInput === 'string' && labelInput.trim() ? labelInput.trim() : uriLabel;
    if (!label || label.length > 160 || issuer.length > 160 || !['SHA1', 'SHA256', 'SHA512'].includes(algorithm)
        || ![6, 8].includes(digits) || !Number.isInteger(period) || period < 5 || period > 300) throw new Error('invalid_secret');
    return { label, issuer, secret, algorithm, digits, period };
}

export async function generateTotp(settings: TotpSettings, now = Date.now()): Promise<string> {
    const counter = new ArrayBuffer(8);
    new DataView(counter).setBigUint64(0, BigInt(Math.floor(now / 1000 / settings.period)));
    const key = await crypto.subtle.importKey('raw', decodeBase32(settings.secret),
        { name: 'HMAC', hash: settings.algorithm.replace('SHA', 'SHA-') }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter));
    const offset = mac[mac.length - 1] & 15;
    const number = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
    return String(number % (10 ** settings.digits)).padStart(settings.digits, '0');
}

async function encryptionKey(encoded: string): Promise<CryptoKey> {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (bytes.length !== 32) throw new Error('Invalid authenticator encryption configuration');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptTotp(secret: string, encodedKey: string, id: string) {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
        additionalData: new TextEncoder().encode(id) }, await encryptionKey(encodedKey), new TextEncoder().encode(secret));
    return { secret_ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        secret_nonce: btoa(String.fromCharCode(...nonce)) };
}

export async function decryptTotp(ciphertext: string, nonce: string, encodedKey: string, id: string) {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM',
        iv: Uint8Array.from(atob(nonce), c => c.charCodeAt(0)), additionalData: new TextEncoder().encode(id) },
    await encryptionKey(encodedKey), Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0)));
    return new TextDecoder().decode(decrypted);
}
