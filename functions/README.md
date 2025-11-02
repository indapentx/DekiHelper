## DeepL Proxy Function

This project exposes `translateWithDeepL` as an HTTPS Cloud Function that proxies requests to the DeepL API. The proxy lets the web client call DeepL without running into browser CORS blocks and keeps the DeepL key out of the public bundle.

### Configure

```bash
cd functions
npm install
firebase functions:config:set deepl.key="YOUR_DEEPL_KEY"
# Optional comma-separated origin list
firebase functions:config:set deepl.allowed_origins="https://deki-helper.web.app,http://localhost:5000"
```

If you are testing locally with the Functions emulator you can skip the config step and provide the key from the client.

### Deploy

```bash
firebase deploy --only functions:translateWithDeepL
```

### Test Locally

```bash
firebase emulators:start --only functions
```

The web app automatically targets the local emulator (`http://localhost:5001/...`) when it is served from `localhost` or `127.0.0.1`. In production it calls `https://us-central1-<project>.cloudfunctions.net/translateWithDeepL`.
