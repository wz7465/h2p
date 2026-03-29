const { chromium } = require("playwright");
const fs = require("fs");

async function waitForRealLoginPage(page) {
  for (let i = 0; i < 10; i++) {
    const url = page.url();

    // 1. Google Vignette 广告层
    if (url.includes("google_vignette")) {
      console.log("[H2P] Google Vignette detected → closing...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1500);
      continue;
    }

    // 2. Cloudflare challenge
    if (url.includes("/cdn-cgi/")) {
      console.log("[H2P] Cloudflare challenge detected → waiting...");
      await page.waitForTimeout(3000);
      continue;
    }

    // 3. 检查 email 输入框是否出现
    const emailExists = await page.$("input[name='email']");
    if (emailExists) {
      console.log("[H2P] Login form detected");
      return;
    }

    console.log("[H2P] Login form not ready → retrying...");
    await page.waitForTimeout(1500);
  }

  throw new Error("Login page never loaded (blocked by ads or Cloudflare)");
}

async function main() {
  console.log("[H2P] Starting Host2Play Gratis renew task...");

  const browser = await chromium.connectOverCDP("http://localhost:9222");

  let context;
  if (fs.existsSync("google_cookies.json")) {
    context = await browser.newContext({ storageState: "google_cookies.json" });
    console.log("[H2P] Loaded Google cookies");
  } else {
    context = await browser.newContext();
    console.log("[H2P] No cookie file, using fresh context");
  }

  const page = await context.newPage();

  try {
    console.log("[H2P] Opening login page...");
    await page.goto("https://host2play.gratis/sign-in", { timeout: 60000 });

    // 等待真正的登录页出现
    await waitForRealLoginPage(page);

    // 填写账号密码
    await page.fill("input[name='email']", process.env.H2P_EMAIL);
    await page.fill("input[name='password']", process.env.H2P_PASSWORD);

    console.log("[H2P] Logging in...");
    await page.click("button[type='submit']");

    await page.waitForURL(/panel\/bot/i, { timeout: 30000 });
    console.log("[H2P] Login success");

    // 打开 Renew 页面
    const renewUrl = "https://host2play.gratis/server/renew?i=93697c53-c1e3-475a-89f2-ec3bf012d18d";
    console.log("[H2P] Opening renew page...");
    await page.goto(renewUrl, { timeout: 60000 });

    // 等待跳转到 cp.host2play.gratis
    await page.waitForURL(/cp\.host2play\.gratis/i, { timeout: 20000 });
    console.log("[H2P] Reached CP panel");

    // 等待成功提示
    await page.waitForSelector("text=Renewed successfully", {
      timeout: 20000
    });

    console.log("[H2P] Renew success!");

    await context.storageState({ path: "google_cookies.json" });

    console.log(JSON.stringify({ success: true }));
  } catch (err) {
    console.error("[H2P] ERROR:", err.message);

    await context.storageState({ path: "google_cookies.json" });

    console.log(JSON.stringify({ success: false, error: err.message }));
  } finally {
    await page.close();
  }
}

main();
