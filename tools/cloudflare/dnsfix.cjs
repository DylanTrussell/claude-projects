// fall back to direct DNS when the system resolver comes up empty (this process only)
const dns = require('dns'); const orig = dns.lookup;
dns.lookup = function (host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; } if (typeof opts === 'number') opts = { family: opts };
  orig.call(dns, host, opts, (err, addr, fam) => {
    if (!err) return cb(err, addr, fam);
    dns.resolve4(host, (e2, a) => {
      if (e2 || !a || !a.length) return cb(err, addr, fam);
      if (opts && opts.all) return cb(null, a.map(x => ({ address: x, family: 4 })));
      cb(null, a[0], 4);
    });
  });
};
