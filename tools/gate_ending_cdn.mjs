import fs from 'fs';
import { execSync } from 'child_process';
const s = fs.readFileSync('/Users/dylantrussell/Dev/apocalypse-meow/game/chunks.js', 'utf8');
const m = /ending:\s*(CDN|HF)\s*\+\s*'([^']+)'/.exec(s);
if (!m) throw new Error('no ending entry in chunks.js');
const base = m[1] === 'HF'
  ? 'https://d8j0ntlcm91z4.cloudfront.net/user_326nzvdI1NU8OaRgxKtyLxSyQWq/'
  : 'https://d2ol7oe51mr4n9.cloudfront.net/user_326nzvdI1NU8OaRgxKtyLxSyQWq/';
const code = execSync(`curl -s -o /dev/null -w '%{http_code}' -r 0-500 '${base}${m[2]}'`).toString().trim();
if (code === '200' || code === '206') console.log('G2_OK'); else throw new Error('http ' + code);
