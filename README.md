# OTP Follow QA Agent

This is a configurable Playwright runner for testing OTP signup/login and a follow action on websites you own or are authorized to test.

It does not use disposable public temp-mail scraping. Use a QA inbox provider with an API:

- Mailosaur
- MailSlurp

## Setup

```powershell
cd otp-follow-agent
npm install
Copy-Item config.example.json config.json
Copy-Item .env.example .env
```

Edit `config.json`:

- `signupUrl`: your signup or login page
- `targetProfileUrl`: the profile/page to follow
- `maxUsers`: test user count, hard-capped at 90
- `selectors`: CSS selectors for your app's form fields and buttons
- `otpRegex`: defaults to matching 4-8 digit OTPs

Edit `.env` for your inbox provider:

```text
MAILOSAUR_API_KEY=...
MAILOSAUR_SERVER_ID=...
```

or:

```text
MAILSLURP_API_KEY=...
MAILSLURP_INBOX_ID=...
```

For Mailosaur, the runner creates addresses like:

```text
qa-follower-1720000000000-1@YOUR_SERVER_ID.mailosaur.net
```

## Run

```powershell
npm run start
```

To watch the browser:

```powershell
$env:HEADLESS="false"; npm run start
```

## Notes

The runner is selector-driven because every project has different markup. If it cannot click or fill something, update the matching selector in `config.json`.

Use this only against your own staging/local site or a site you are authorized to test.
