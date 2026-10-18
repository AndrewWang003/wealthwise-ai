export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { Buffer } = await import('node:buffer');
        if (typeof (global as any).SlowBuffer === 'undefined') {
            (global as any).SlowBuffer = Buffer;
            console.log('SlowBuffer polyfill applied in instrumentation (nodejs)');
        }

        // Also apply to the buffer module itself to catch dependencies doing require('buffer').SlowBuffer
        try {
            const bufferModule = await import('node:buffer');
            if (typeof (bufferModule as any).SlowBuffer === 'undefined') {
                Object.defineProperty(bufferModule, 'SlowBuffer', {
                    value: Buffer,
                    enumerable: true,
                    configurable: true
                });
                console.log('buffer.SlowBuffer polyfill applied in instrumentation');
            }
        } catch (e) {
            // Ignore errors in different environments
        }
    }
}
