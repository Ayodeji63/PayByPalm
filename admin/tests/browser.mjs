// Test-only API fixtures. Never authenticates against Supabase or changes live data.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, chmodSync, unlinkSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
const origin = process.env.ADMIN_TEST_ORIGIN || "http://127.0.0.1:5190";
const artifacts = new URL("../test-results/", import.meta.url).pathname;
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const now = new Date().toISOString(),
  user = { id: randomUUID(), email: "operator@example.test" };
const merchant = (name, email, subaccount) => ({
  id: randomUUID(),
  name,
  contact_email: email,
  contact_phone: "+234 800 000 0000",
  address: "Test address",
  paystack_subaccount: subaccount,
  created_at: now,
  updated_at: now,
});
const merchants = [
  merchant("Ayo Stores", "ayo@example.test", null),
  merchant("Northside Market", "north@example.test", "ACCT_fixture01"),
  merchant("Juniper Coffee", "juniper@example.test", null),
  merchant("Campus Essentials", "campus@example.test", "ACCT_fixture02"),
];
const terminals = [
  {
    id: randomUUID(),
    merchant_id: merchants[0].id,
    label: "Ayo Stores — Counter 1",
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    disabled_at: null,
  },
  {
    id: randomUUID(),
    merchant_id: merchants[1].id,
    label: "Northside — Main Counter",
    last_seen_at: null,
    created_at: now,
    updated_at: now,
    disabled_at: null,
  },
];
const activity = [];
let signedIn = false,
  failCreate = true,
  terminalHash = "",
  merchantRequests = 0, payoutCreates=0, payoutChecks=0, payoutSetup=null;
await context.route("**/api/**", async (route) => {
  const req = route.request(),
    path = new URL(req.url()).pathname;
  let status = 200,
    data = {};
  if (path === "/api/auth/session") {
    status = signedIn ? 200 : 401;
    data = signedIn
      ? { user }
      : { error: { code: "sign_in_required", message: "Sign in." } };
  } else if (path === "/api/auth/login") {
    signedIn = true;
    data = { user };
  } else if (path === "/api/auth/logout") {
    signedIn = false;
    status = 204;
  } else if (path === "/api/overview")
    data = {
      merchants,
      terminals,
      activity,
      terminalUrl: "https://pay-by-palm.vercel.app/terminal",
      fixture: true,
    };
  else if(path==='/api/payouts/banks')data={mode:'live',enabled:true,banks:[{code:'058',name:'Fixture Bank'}]};
  else if(path==='/api/payouts/verify'){
    const body=req.postDataJSON();assert.equal(body.bankCode,'058');assert.equal(body.accountNumber,'0123456789');
    data={mode:'live',bankName:'Fixture Bank',accountName:'ASTER GROCERIES',accountLast4:'6789',verificationToken:'encrypted-fixture-token',expiresAt:new Date(Date.now()+300000).toISOString()};
  }
  else if(/^\/api\/merchants\/[^/]+\/payout$/.test(path)){
    const m=merchants.find(m=>m.id===path.split('/')[3]);assert.ok(m);
    if(req.method()==='GET')data={mode:'live',enabled:true,setup:payoutSetup,subaccountCode:m.paystack_subaccount};
    else {
      const body=req.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['expected','percentageCharge','verificationToken']);assert.equal(body.percentageCharge,0);
      payoutCreates++;payoutSetup={mode:'live',status:'needs_review',bankName:'Fixture Bank',accountName:'ASTER GROCERIES',accountLast4:'6789',percentageCharge:0,subaccountCode:null,verified:null,active:null};
      status=502;data={error:{code:'paystack_unavailable',message:'Paystack could not confirm the result. Check status before trying again.'}};
    }
  }
  else if(/^\/api\/merchants\/[^/]+\/payout\/check$/.test(path)){
    payoutChecks++;const m=merchants.find(m=>m.id===path.split('/')[3]);
    payoutSetup={...payoutSetup,status:'created',subaccountCode:'ACCT_fixtureCreated',verified:false,active:true};m.paystack_subaccount='ACCT_fixtureCreated';m.updated_at=new Date(Date.now()+1000).toISOString();
    data={merchant:m,setup:payoutSetup};
  }
  else if (path === "/api/merchants") {
    merchantRequests++;
    const body = req.postDataJSON();
    assert.equal(body.name, "Aster Groceries");
    assert.equal(body.expected, null);
    if (failCreate) {
      failCreate = false;
      status = 503;
      data = {
        error: {
          code: "database_unavailable",
          message:
            "The database could not confirm this operation. Retry this request.",
        },
      };
    } else {
      const m = {
        id: body.id,
        name: body.name,
        contact_email: body.email || null,
        contact_phone: body.phone || null,
        address: body.address || null,
        paystack_subaccount: body.subaccount || null,
        created_at: now,
        updated_at: now,
      };
      merchants.push(m);
      data = { merchant: m };
      activity.unshift({
        id: randomUUID(),
        action: "merchant.created",
        entity_id: m.id,
        merchant_id: m.id,
        label: m.name,
        created_at: now,
      });
    }
  } else if (path === "/api/terminals") {
    const body = req.postDataJSON();
    assert.deepEqual(
      Object.keys(body).sort(),
      ["id", "keyHash", "label", "merchantId"].sort(),
    );
    assert.match(body.keyHash, /^[0-9a-f]{64}$/);
    terminalHash = body.keyHash;
    const t = {
      id: body.id,
      merchant_id: body.merchantId,
      label: body.label,
      last_seen_at: null,
      created_at: now,
      updated_at: now,
      disabled_at: null,
    };
    terminals.push(t);
    data = { terminal: t };
  } else if (path.startsWith("/api/terminals/")) {
    const body = req.postDataJSON(),
      t = terminals.find((t) => t.id === path.split("/").pop());
    assert.ok(t);
    if (body.action === "disable") t.disabled_at = new Date().toISOString();
    else if (body.action === "rotate") {
      assert.match(body.keyHash, /^[0-9a-f]{64}$/);
      t.disabled_at = null;
      terminalHash = body.keyHash;
    } else t.label = body.label;
    t.updated_at = new Date(Date.now() + 1000).toISOString();
    data = { terminal: t };
  } else {
    status = 404;
    data = { error: { code: "not_found", message: "Fixture route not found" } };
  }
  await route.fulfill(status === 204 ? { status } : { status, json: data });
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
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
try {
  await page.goto(origin);
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await screenshot("login-desktop");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("operator@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in to admin" }).click();
  await page.getByRole("heading", { name: "Merchant directory" }).waitFor();
  await screenshot("merchants-desktop");
  await page.getByRole("button", { name: "Add merchant", exact: true }).click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Aster Groceries");
  await page.getByLabel("Contact email (optional)").fill("aster@example.test");
  const formHash = new URL(page.url()).hash;
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.getByRole("link", { name: "Skip to content" }).press("Enter");
  assert.equal(new URL(page.url()).hash, formHash);
  assert.equal(
    await page.getByLabel("Business name", { exact: true }).inputValue(),
    "Aster Groceries",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "content",
  );
  await page
    .getByRole("button", { name: "Create merchant", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  assert.equal(merchants.length, 4);
  await page
    .getByRole("button", { name: "Create merchant", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Aster Groceries", exact: true })
    .waitFor();
  assert.equal(merchantRequests, 2);
  assert.equal(merchants.length, 5);
  await page.getByRole('heading',{name:'Bank payouts',exact:true}).waitFor();
  await page.getByLabel('Settlement bank',{exact:true}).selectOption('058');
  await page.getByLabel('Account number',{exact:true}).fill('0123456789');
  await page.getByRole('button',{name:'Verify bank account',exact:true}).click();
  await page.getByText('Account name confirmed',{exact:true}).waitFor();
  const payoutCreate=page.getByRole('button',{name:'Confirm and create payout account',exact:true});
  assert.equal(await payoutCreate.isDisabled(),true);
  const consent=page.getByRole('checkbox');await consent.check();
  await page.getByLabel('PayByPalm share (%)',{exact:true}).fill('1');assert.equal(await consent.isChecked(),false);
  await page.getByLabel('PayByPalm share (%)',{exact:true}).fill('0');await consent.check();
  await screenshot('payout-verified-desktop');
  await page.setViewportSize({width:390,height:844});await screenshot('payout-verified-mobile');
  await page.setViewportSize({width:1440,height:1000});
  await payoutCreate.click();
  await page.getByRole('button',{name:'Check status',exact:true}).waitFor();
  assert.equal(payoutCreates,1);assert.equal(await payoutCreate.count(),0);
  await page.getByRole('button',{name:'Check status',exact:true}).click();
  await page.getByText('ACCT_fixtureCreated',{exact:true}).waitFor();
  await page.getByText(/Payout verification is pending or has not been checked/).waitFor();
  assert.equal(payoutCreates,1);assert.equal(payoutChecks,1);
  await page.getByRole('button',{name:'Load latest details',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)+JSON.stringify(sessionStorage)), '{}{}');

  await page
    .getByLabel("Business name", { exact: true })
    .fill("Unsaved merchant draft");
  merchants.at(-1).name = "Aster Groceries Updated";
  merchants.at(-1).updated_at = new Date(Date.now() + 2000).toISOString();
  await page.getByRole("button", { name: "Refresh inventory" }).click();
  await page.getByRole("button", { name: "Load latest details" }).waitFor();
  assert.equal(
    await page.getByLabel("Business name", { exact: true }).inputValue(),
    "Unsaved merchant draft",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Load latest details" }).click();
  assert.equal(
    await page.getByLabel("Business name", { exact: true }).inputValue(),
    "Aster Groceries Updated",
  );
  await page.getByRole("button", { name: "Add terminal", exact: true }).click();
  await page
    .getByLabel("Terminal label", { exact: true })
    .fill("Aster — Counter 1");
  await page
    .getByRole("button", { name: "Register terminal", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Terminal registered", exact: true })
    .waitFor();
  await screenshot("device-setup-desktop");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download terminal.env" }).click();
  const download = await downloadPromise;
  const file = artifacts + "fixture-terminal.env";
  await download.saveAs(file);
  chmodSync(file, 0o600);
  const contents = readFileSync(file, "utf8"),
    key = contents.match(/TERMINAL_KEY=(\S+)/)[1];
  assert.equal(createHash("sha256").update(key).digest("hex"), terminalHash);
  assert.ok(
    contents.includes("KIOSK_URL='https://pay-by-palm.vercel.app/terminal'"),
  );
  unlinkSync(file);
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
    "Credentials must not be stored in browser storage",
  );
  await page
    .getByRole("button", { name: "I’ve downloaded it — open terminal" })
    .click();
  await page.getByRole("heading", { name: "Terminal configuration" }).waitFor();
  await page
    .getByLabel("Terminal label", { exact: true })
    .fill("Unsaved terminal draft");
  terminals.at(-1).label = "Aster — Updated Counter";
  terminals.at(-1).updated_at = new Date(Date.now() + 3000).toISOString();
  await page.getByRole("button", { name: "Refresh inventory" }).click();
  await page
    .getByRole("button", { name: "Load latest configuration" })
    .waitFor();
  assert.equal(
    await page.getByLabel("Terminal label", { exact: true }).inputValue(),
    "Unsaved terminal draft",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save label", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Replace device key", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Load latest configuration" }).click();
  assert.equal(
    await page.getByLabel("Terminal label", { exact: true }).inputValue(),
    "Aster — Updated Counter",
  );
  await page
    .getByRole("button", { name: "Disable terminal", exact: true })
    .click();
  await page.getByRole("heading", { name: "Disable this terminal?" }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(terminals.at(-1).disabled_at, null);
  await page
    .getByRole("button", { name: "Disable terminal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disable terminal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate key to re-enable" })
    .waitFor();
  assert.ok(terminals.at(-1).disabled_at);
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("terminal-mobile");
  await page.getByRole("link", { name: /Terminals/ }).click();
  await page.getByRole("heading", { name: "Terminal inventory" }).waitFor();
  await screenshot("terminals-mobile");
  await page.getByRole("link", { name: /Activity/ }).click();
  await page
    .getByRole("heading", { name: "Recent operator changes" })
    .waitFor();
  await screenshot("activity-mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("login-mobile");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: bank resolution/confirmed fee/ambiguous creation/status recovery with no duplicate/Paystack approval status; login, desktop/mobile inventory, merchant failure/retry, preserved draft conflict baselines, skip navigation, terminal binding, private config download/hash, no stored credentials, confirmed disable and logout. Test-only API fixtures.",
  );
} catch (e) {
  await page
    .screenshot({ path: artifacts + "failure.png", fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await context.close();
  await browser.close();
}
