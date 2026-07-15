const UINT32_RANGE = 0x1_0000_0000;

export const secureRandomInt = (maxExclusive: number): number => {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
        throw new RangeError("maxExclusive must be an integer between 1 and 2^32");
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const sample = new Uint32Array(1);
    do {
        crypto.getRandomValues(sample);
    } while (sample[0] >= limit);
    return sample[0] % maxExclusive;
};

export const secureRandomString = (length: number, alphabet: string): string => {
    if (!Number.isSafeInteger(length) || length < 1) {
        throw new RangeError("length must be a positive integer");
    }
    if (alphabet.length < 2) {
        throw new RangeError("alphabet must contain at least two characters");
    }
    let value = "";
    for (let index = 0; index < length; index++) {
        value += alphabet[secureRandomInt(alphabet.length)];
    }
    return value;
};
