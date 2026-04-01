"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nanoid = nanoid;
const crypto_1 = require("crypto");
function nanoid(size = 12) {
    return (0, crypto_1.randomBytes)(size).toString('base64url').slice(0, size);
}
//# sourceMappingURL=nanoid.js.map