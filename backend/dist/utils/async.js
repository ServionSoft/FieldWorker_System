export const wrap = (fn) => (req, res, next) => { fn(req, res, next).catch(next); };
//# sourceMappingURL=async.js.map