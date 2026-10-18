// Polyfill for SlowBuffer which is removed in Node 25+ but needed by some legacy dependencies
try {
    const buffer = require('buffer');
    if (typeof buffer.SlowBuffer === 'undefined') {
        Object.defineProperty(buffer, 'SlowBuffer', {
            value: buffer.Buffer,
            enumerable: true,
            configurable: true
        });
    }
    if (typeof global.SlowBuffer === 'undefined') {
        global.SlowBuffer = buffer.Buffer;
    }
    console.log('SlowBuffer polyfill applied successfully');
} catch (e) {
    console.error('Failed to apply SlowBuffer polyfill:', e);
}
