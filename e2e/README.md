# Email Transfer Station E2E tests

The integration suite uses Docker Compose, Playwright, and Mailpit. It runs entirely
against disposable local containers and does not require production credentials.

## Run

```bash
cd e2e
npm ci
npm test
npm run test:down
```

`npm test` builds and starts Mailpit, the Worker, the frontend, and the Playwright
runner. Its exit code is the test result; `test:down` removes the containers and
volumes.

| Test area | Coverage |
| --- | --- |
| `tests/api/` | health check, address lifecycle, mail receive/send paths, admin and domain behaviors |
| `tests/browser/` | login, inbox, HTML reply/rendering, responsive UI, and XSS regression paths |

Artifacts are written to ignored `e2e/test-results/` and
`e2e/playwright-report/` directories.

The test Worker uses files under `fixtures/`, enables `E2E_TEST_MODE`, and may use an
optional `E2E_TEST_SECRET`. Those settings are for isolated containers only and must
never be copied to a deployed Worker.
