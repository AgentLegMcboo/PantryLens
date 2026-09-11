/// <reference types="nativewind/types" />

/**
 * TypeScript 6 (which arrived with SDK 57) rejects a side-effect import of a
 * module it has no declaration for — TS2882. `import '../global.css'` in the app
 * root is exactly that: Metro's NativeWind transform consumes it, TypeScript
 * never sees a module. Declaring it keeps the import, which must stay, from
 * being an error.
 */
declare module '*.css';
