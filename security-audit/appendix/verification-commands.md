# Verification commands

These are the safe, reproducible commands used for the dynamic checks, adapted for a
reviewer. They assume:

- the production build is present (`npm run build`) and `server.js` exists;
- a local echo server stands in for Ollama, so no real model is touched;
- `OLLAMA_MODELS` points at a disposable fixture, never the real model store;
- `$BASE` is the audit instance (for example `http://127.0.0.1:45871`);
- `$TMP` is `node -p "require('os').tmpdir()"` (on macOS this is under
  `/var/folders/...`, not `/tmp`).

> **Safety:** do not run the cleanup tests with the default `OLLAMA_MODELS`
> (`~/.ollama/models`). Do not send `{"action":"stop"}` to a real Ollama instance. Do
> not use a real `PROXY_TOKEN` in a test build; use a throwaway value.

## 1. Start an echo upstream and a fixture-only server

```bash
cat > /tmp/audit-echo.mjs <<'EOF'
import http from 'node:http';
const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  console.log(JSON.stringify({
    method: req.method,
    url: req.url,
    headers: req.headers,
    bytes: Buffer.concat(chunks).length
  }));
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
});
server.listen(45872, '127.0.0.1', () => console.log('echo-ready'));
EOF
node /tmp/audit-echo.mjs > /tmp/audit-echo.log 2>&1 &

mkdir -p /tmp/os-audit-models/blobs /tmp/os-audit-models/manifests
PORT=45871 HOST=127.0.0.1 \
  OLLAMA_HOST=http://127.0.0.1:45872 \
  OLLAMA_MODELS=/tmp/os-audit-models \
  node server.js > /tmp/audit-app.log 2>&1 &
```

Set `BASE=http://127.0.0.1:45871`.

## 2. Host header and DNS rebinding

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Host: evil.example:45871' "$BASE/healthz"          # expect 200 before fix

curl -s --resolve evil.example:45871:127.0.0.1 \
  "http://evil.example:45871/api/cache"                   # expect 200 JSON before fix
```

After the fix, both should be 421/403.

## 3. Cross-origin CSRF

```bash
TMP="$(node -p "require('os').tmpdir()")"
mkdir -p "$TMP/ollama-studio-csrf-fixture"
printf 'proof' > "$TMP/ollama-studio-csrf-fixture/file.bin"
touch -t 202001010000 "$TMP/ollama-studio-csrf-fixture"

curl -s -X POST \
  -H 'Origin: https://evil.example' \
  -H 'Sec-Fetch-Site: cross-site' \
  -H 'Content-Type: text/plain' \
  --data '{"targets":["temp"]}' \
  "$BASE/api/cache/cleanup"
```

Before the fix this returns 200 and deletes the fixture; after the fix it should
return 403/415 and leave the fixture in place.

```bash
curl -s -X POST \
  -H 'Origin: https://evil.example' \
  -H 'Content-Type: text/plain' \
  --data '{"kind":"pull","model":"csrf-audit-model"}' \
  "$BASE/api/downloads"
```

Before the fix this creates a job; after the fix it should be rejected. Cancel any
created job with `DELETE /api/downloads/<id>`.

## 4. Token extraction from the static bundle

Build with a throwaway token and serve the build from a temp root:

```bash
VITE_PROXY_TOKEN=test-only-not-a-secret npx vite build \
  --outDir /tmp/os-token-dist --emptyOutDir

rm -rf /tmp/os-token-root
mkdir -p /tmp/os-token-root
cp server.js /tmp/os-token-root/server.js
cp -R /tmp/os-token-dist /tmp/os-token-root/dist
ln -s "$PWD/node_modules" /tmp/os-token-root/node_modules

PORT=45876 HOST=127.0.0.1 \
  PROXY_TOKEN=test-only-not-a-secret \
  OLLAMA_HOST=http://127.0.0.1:45872 \
  OLLAMA_MODELS=/tmp/os-audit-models \
  node /tmp/os-token-root/server.js > /tmp/audit-token.log 2>&1 &
```

```bash
TOKEN_BASE=http://127.0.0.1:45876
JS=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' /tmp/os-token-root/dist/index.html | head -1)
curl -s "$TOKEN_BASE/$JS" | grep -o 'test-only-not-a-secret'   # expect 1 before fix
curl -s -o /dev/null -w '%{http_code}\n' "$TOKEN_BASE/api/cache"   # 401
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Authorization: Bearer test-only-not-a-secret' "$TOKEN_BASE/api/cache"  # 200
```

After the fix, the token must not appear in the bundle; the build test should fail if
it does.

## 5. Cache scan completeness

```bash
BLOB="sha256-$(python3 -c 'print("d"*64)')"
printf 'orphan-data' > "/tmp/os-audit-models/blobs/$BLOB"

curl -s "$BASE/api/cache" | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print(d["scanComplete"], d["blobs"]["orphan"]["files"])'
# before fix: True 1; after fix: False 1 (or orphan cleanup disabled)

curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"targets":["orphan"]}' "$BASE/api/cache/cleanup"
# after fix: 409, and the blob remains in blobs/
```

## 6. Cleanup during an active download

Use an echo upstream that keeps `/api/pull` open (or any slow upstream):

```bash
cat > /tmp/audit-slow-echo.mjs <<'EOF'
import http from 'node:http';
http.createServer((req, res) => {
  if (req.url === '/api/pull') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write('{"status":"pulling manifest"}\n');
    setTimeout(() => res.end(), 60000);
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end('{"ok":true}');
}).listen(45877, '127.0.0.1');
EOF
node /tmp/audit-slow-echo.mjs > /tmp/audit-slow-echo.log 2>&1 &
```

Start a second audit server on 45878 with `OLLAMA_HOST=http://127.0.0.1:45877` and a
second fixture (`/tmp/os-audit-models2`), then:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"kind":"pull","model":"active-proof"}' \
  http://127.0.0.1:45878/api/downloads

TMP="$(node -p "require('os').tmpdir()")"
mkdir -p "$TMP/ollama-studio-active-proof"
printf 'in-progress' > "$TMP/ollama-studio-active-proof/part.bin"
touch -t 202001010000 "$TMP/ollama-studio-active-proof"

BLOB="sha256-$(python3 -c 'print("e"*64)')"
printf 'fresh' > "/tmp/os-audit-models2/blobs/$BLOB"

curl -s -X POST -H 'Content-Type: application/json' \
  --data '{"targets":["orphan","temp"]}' \
  http://127.0.0.1:45878/api/cache/cleanup
```

Before the fix, `report.activeDownloads` is true but `removed.temp=1` and
`removed.orphan=1`; after the fix, expect 409 and both fixtures remain.

## 7. Proxy header forwarding

```bash
: > /tmp/audit-echo.log   # note: the running echo process may pad with NULs
curl -s -o /dev/null -H 'Authorization: Bearer test-token' \
  -H 'X-Proxy-Token: test-token' \
  -H 'Cookie: session=leak-me' \
  "$BASE/ollama/api/version"

tr -d '\000' < /tmp/audit-echo.log | tail -1 | python3 -m json.tool
```

Before the fix, the upstream JSON contains `authorization`, `x-proxy-token`, and
`cookie`; after the fix, it must not.

## 8. Headers and error handling

```bash
curl -s -D - -o /dev/null "$BASE/" | grep -iE \
  'content-security|x-frame|x-content-type|referrer|permissions|x-powered'
# before: only X-Powered-By; after: all expected headers, no X-Powered-By

curl -s --path-as-is -D - "$BASE/%ZZ" -o /tmp/err.html
head -c 500 /tmp/err.html
# before: URIError stack with absolute paths; after: generic 400, no stack
```

## 9. Proxy body and concurrency

```bash
python3 - <<'PY'
import http.client
body = b'x' * (5 * 1024 * 1024)
c = http.client.HTTPConnection('127.0.0.1', 45871, timeout=30)
c.request('POST', '/ollama/api/echo', body=body,
          headers={'Content-Type': 'application/octet-stream'})
r = c.getresponse()
print(r.status, len(r.read()))
PY
```

Before the fix the 5 MB body is accepted; after the fix either 413 or streamed with a
bounded heap. For concurrency:

```bash
for i in $(seq 1 10); do
  curl -s -X POST -H 'Content-Type: application/json' \
    --data "{\"kind\":\"pull\",\"model\":\"cap-$i\"}" \
    "$BASE/api/downloads" > /dev/null
done
curl -s "$BASE/api/downloads" | python3 -c \
  'import json,sys; print(len(json.load(sys.stdin)["jobs"]))'
```

After the fix, the number of running jobs should be capped and excess requests should
be queued/rejected.

## 10. Auth matrix and ModelScope token bug

Start a token-protected instance on 45873 with the same echo/fixture:

```bash
PORT=45873 HOST=127.0.0.1 PROXY_TOKEN=test-token \
  OLLAMA_HOST=http://127.0.0.1:45872 \
  OLLAMA_MODELS=/tmp/os-audit-models \
  node server.js > /tmp/audit-token.log 2>&1 &
```

```bash
for path in /api/cache /api/daemon /api/metrics /api/catalog/search?q=llama /api/hf/api/models?limit=1 /healthz; do
  printf '%-38s %s\n' "$path" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:45873$path")"
done

curl -s -o /dev/null -w '%{http_code}\n' \
  'http://127.0.0.1:45873/api/modelscope/search?q=qwen'          # 401 before client fix
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Authorization: Bearer test-token' \
  'http://127.0.0.1:45873/api/modelscope/search?q=qwen'          # 200
```

## 11. Dependency, secret, and baseline checks

```bash
npm audit --json
git ls-files | grep -Ei '\.env|secret|credential' || true
git log --all -p | grep -nEi \
  'sk-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN .*PRIVATE KEY' || true
npm test
npm run typecheck
```

## 12. Cleanup after testing

```bash
# Kill only the audit PIDs you started.
kill "$(cat /tmp/audit-app.pid 2>/dev/null)" 2>/dev/null || true

# Verify each path is a temporary fixture before removing it.
rm -rf /tmp/os-audit-models /tmp/os-audit-models2
rm -rf /tmp/os-token-root /tmp/os-token-dist /tmp/audit-echo.mjs /tmp/audit-slow-echo.mjs
rm -rf "$TMP"/ollama-studio-csrf-fixture "$TMP"/ollama-studio-active-proof
```

Do not remove `/var/folders/.../T/ollama-studio-*` directories you did not create.
