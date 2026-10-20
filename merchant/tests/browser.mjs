// Synthetic fixtures only. Never signs into Supabase or reads real financial data.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
const base = process.env.MERCHANT_TEST_ORIGIN || "http://127.0.0.1:5193";
const artifacts = new URL("../test-results/", import.meta.url).pathname;
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const business = { id: randomUUID(), name: "Ayo Stores" },
  other = { id: randomUUID(), name: "Campus Coffee" },
  user = { id: randomUUID(), email: "owner@example.test" };
let signedIn = false,
  mode = "live",
  failSettlements = false,
  revoked = false;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const ago = (n) =>
  new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
const transactions = Array.from({ length: 58 }, (_, i) => ({
  id: randomUUID(),
  reference: "pbp_pay_" + randomUUID().replaceAll("-", ""),
  amount_minor: [245000, 365000, 180000, 65000, 920000][i % 5],
  description: "Counter sale",
  status: i % 9 === 0 ? "failed" : i % 11 === 0 ? "processing" : "settled",
  created_at: ago(Math.floor(i / 2)) + "T14:20:00+01:00",
  settled_at: ago(Math.floor(i / 2)) + "T14:21:00+01:00",
  terminal_label:
    i % 3 === 0 ? "Ayo Stores — Counter 2" : "Ayo Stores — Counter 1",
  domain: "live",
}));
const testPayments = [
  {
    ...transactions[0],
    id: randomUUID(),
    reference: "pbp_pay_" + randomUUID().replaceAll("-", ""),
    domain: "test",
    amount_minor: 5000,
    status: "settled",
  },
];
const terminals = [
  {
    id: randomUUID(),
    label: "Ayo Stores — Counter 1",
    last_seen_at: new Date().toISOString(),
    disabled_at: null,
  },
  {
    id: randomUUID(),
    label: "Ayo Stores — Counter 2",
    last_seen_at: new Date(Date.now() - 7200000).toISOString(),
    disabled_at: null,
  },
];
const settings = () => ({
  paymentMode: mode,
  business: {
    ...business,
    email: "owner@example.test",
    phone: "+234 800 000 0000",
    address: "Lagos, Nigeria",
  },
  payoutConfigured: true,
  payout: {
    bank_name: "Fixture Bank",
    account_last4: "6789",
    account_name: "AYO STORES",
    percentage_charge: 0,
    provider_verified: true,
    provider_active: true,
  },
});
await context.route("**/api/**", async (route) => {
  const req = route.request(),
    url = new URL(req.url()),
    path = url.pathname;
  let status = 200,
    result = {};
  if (path === "/api/auth/session") {
    status = signedIn ? 200 : 401;
    result = signedIn
      ? { user, businesses: [business, other] }
      : { error: { code: "sign_in_required", message: "Sign in." } };
  } else if (path === "/api/auth/login") {
    const input = req.postDataJSON();
    assert.equal(input.email, user.email);
    signedIn = true;
    result = { user, businesses: [business, other] };
  } else if (path === "/api/auth/logout") {
    signedIn = false;
    status = 204;
  } else if (path.startsWith("/api/reports/")) {
    const resource = path.split("/").at(-1),
      selected = url.searchParams.get("merchantId");
    assert.ok([business.id, other.id].includes(selected));
    if (revoked) {
      status = 403;
      result = {
        error: {
          code: "merchant_access_required",
          message: "This account cannot access that merchant.",
        },
      };
    } else {
      let rows =
        selected === business.id
          ? (mode === "live" ? transactions : testPayments).filter(
              (p) =>
                p.created_at.slice(0, 10) >= url.searchParams.get("from") &&
                p.created_at.slice(0, 10) <= url.searchParams.get("to"),
            )
          : [];
      const filter = url.searchParams.get("status"),
        reference = url.searchParams.get("reference");
      if (filter && filter !== "all")
        rows = rows.filter((p) => p.status === filter);
      if (reference) rows = rows.filter((p) => p.reference === reference);
      const pageNumber = Number(url.searchParams.get("page") || 1);
      if (resource === "overview") {
        const daily = [];
        for (
          let d = url.searchParams.get("from");
          d <= url.searchParams.get("to");
          d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)
        ) {
          const paid = rows.filter(
            (p) => p.status === "settled" && p.created_at.startsWith(d),
          );
          daily.push({
            date: d,
            amountMinor: paid.reduce((s, p) => s + p.amount_minor, 0),
            count: paid.length,
          });
        }
        result = {
          paymentMode: mode,
          summary: {
            paidAmountMinor: rows
              .filter((p) => p.status === "settled")
              .reduce((s, p) => s + p.amount_minor, 0),
            paidCount: rows.filter((p) => p.status === "settled").length,
            pendingCount: rows.filter((p) => p.status === "processing").length,
            failedCount: rows.filter((p) => p.status === "failed").length,
            totalCount: rows.length,
            daily,
          },
          recent: rows.slice(0, 8),
          settings: settings(),
          terminals: selected === business.id ? terminals : [],
        };
      } else if (resource === "transactions")
        result = {
          paymentMode: mode,
          transactions: rows.slice((pageNumber - 1) * 25, pageNumber * 25),
          page: pageNumber,
          hasMore: rows.length > pageNumber * 25,
        };
      else if (resource === "terminals")
        result = {
          paymentMode: mode,
          terminals: selected === business.id ? terminals : [],
          page: 1,
          hasMore: false,
        };
      else if (resource === "settings")
        result = {
          ...settings(),
          business:
            selected === business.id
              ? settings().business
              : {
                  ...other,
                  email: "coffee@example.test",
                  phone: null,
                  address: null,
                },
        };
      else if (resource === "settlements") {
        if (failSettlements) {
          status = 503;
          result = {
            error: {
              code: "payment_service_unavailable",
              message:
                "Settlement reporting is temporarily unavailable. Please retry.",
            },
          };
        } else
          result = {
            paymentMode: mode,
            configured: true,
            settlements: [
              {
                id: 4501021,
                status: "success",
                amountMinor: 498500,
                processedAmountMinor: 500000,
                feesMinor: 1500,
                effectiveAmountMinor: 448500,
                settlementDate: ago(1) + "T00:00:00Z",
              },
              {
                id: 4501022,
                status: "pending",
                amountMinor: 198500,
                processedAmountMinor: 200000,
                feesMinor: 1500,
                effectiveAmountMinor: 198500,
                settlementDate: today + "T00:00:00Z",
              },
            ],
            page: 1,
            hasMore: false,
          };
      } else if (resource === "export") {
        assert.equal(url.searchParams.get("paymentMode"), mode);
        await route.fulfill({
          status: 200,
          contentType: "text/csv",
          body:
            '"Reference","Amount (kobo)"\r\n' +
            rows
              .map((p) => '"' + p.reference + '","' + p.amount_minor + '"')
              .join("\r\n"),
        });
        return;
      } else {
        status = 404;
        result = { error: { code: "not_found", message: "Fixture missing" } };
      }
    }
  } else {
    status = 404;
    result = { error: { code: "not_found", message: "Fixture missing" } };
  }
  await route.fulfill(status === 204 ? { status } : { status, json: result });
});
async function screenshot(name) {
  await page.screenshot({ path: artifacts + name + ".png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Page must not overflow horizontally",
  );
}
const navigate = async (name) => {
  await page
    .getByRole("navigation", { name: "Merchant navigation" })
    .getByRole("link", { name, exact: true })
    .click();
  await page
    .getByRole("heading", {
      name:
        name === "Overview"
          ? business.name
          : name === "Business settings"
            ? "Business settings"
            : name,
      exact: true,
    })
    .first()
    .waitFor();
};
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Welcome to your workspace" })
    .waitFor();
  await screenshot("login-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("login-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Email address", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page
    .getByRole("button", { name: "Sign in to merchant workspace" })
    .click();
  await page
    .getByRole("heading", { name: "Payment activity", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "View payment " + transactions[1].reference })
    .waitFor();
  await screenshot("overview-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("overview-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "View payment " + transactions[1].reference })
    .click();
  await page
    .getByRole("dialog", { name: "Payment details", exact: true })
    .waitFor();
  await page.getByText(transactions[1].reference, { exact: true }).waitFor();
  await page
    .getByRole("dialog", { name: "Payment details", exact: true })
    .screenshot({ path: artifacts + "payment-details.png" });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await navigate("Payments");
  await page
    .getByLabel("Payment status", { exact: true })
    .selectOption("failed");
  await page.locator("td .badge.red").first().waitFor();
  await page.getByLabel("Payment status", { exact: true }).selectOption("all");
  await page
    .getByLabel("Payment reference", { exact: true })
    .fill(transactions[1].reference);
  await page.getByRole("button", { name: "Find payment", exact: true }).click();
  await page
    .getByRole("button", { name: "View payment " + transactions[1].reference })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: /View payment pbp_pay_/ }).count(),
    1,
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export payments", exact: true })
    .click();
  const download = await downloadPromise,
    file = artifacts + "payments.csv";
  await download.saveAs(file);
  const csv = readFileSync(file, "utf8");
  assert.ok(csv.includes(transactions[1].reference));
  assert.equal((csv.match(/pbp_pay_/g) || []).length, 1);
  unlinkSync(file);
  await navigate("Settlements");
  await page.getByText("#4501021", { exact: true }).waitFor();
  assert.match(
    await page.locator("tr").filter({hasText:"#4501021"}).locator("td").last().innerText(),
    /4,485/,
    "Payout uses effective amount after provider deductions, not the pre-adjustment total",
  );
  await screenshot("settlements-desktop");
  failSettlements = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByText("#4501021", { exact: true }).count(),
    0,
    "Provider failures must not leave a successful stale report visible",
  );
  failSettlements = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByText("#4501021", { exact: true }).waitFor();
  await navigate("Terminals");
  await page.getByText("Ayo Stores — Counter 1", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /rotate|refund|withdraw|charge/i })
      .count(),
    0,
  );
  await navigate("Business settings");
  await page.getByText("Ending 6789", { exact: true }).waitFor();
  await navigate("Overview");
  mode = "test";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("Test payments", { exact: true }).waitFor();
  await page.getByText(/These records are simulated/).waitFor();
  assert.equal(
    await page
      .getByRole("button", {
        name: "View payment " + transactions[1].reference,
      })
      .count(),
    0,
  );
  await page
    .getByLabel("Your business", { exact: true })
    .selectOption(other.id);
  await page.getByRole("heading", { name: other.name, exact: true }).waitFor();
  await page.getByText("No payments in this period", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /View payment pbp_pay_/ }).count(),
    0,
  );
  revoked = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText(/This account cannot access that merchant/).waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Payment activity", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
    "Session credentials must not be stored in JS storage",
  );
  await page
    .getByRole("button", { name: "Sign out", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "Welcome to your workspace" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: merchant login, desktop/mobile overview, payment details, filters, CSV export, settlements/outage recovery, terminals, bank details, runtime mode switching, business switching, revocation, logout and no credential storage. Synthetic fixtures only.",
  );
} catch (error) {
  await page
    .screenshot({ path: artifacts + "failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
