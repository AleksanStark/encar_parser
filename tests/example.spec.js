import { test } from "@playwright/test";

test("Filter models by generation year", async ({ browser }) => {
  const brand = "현대";
  const model = "팰리세이드";
  const min_year = "2020";
  const max_year = "2025";
  const min_mileage = "10000";
  const max_mileage = "30000";
  const fuel_type = "가솔린";

  const context = await browser.newContext();
  const page = await context.newPage();
  const currentMonth = new Date().getMonth() + 1;

  await page.goto("http://www.encar.com/index.do");
  await page.locator("#gnb").getByRole("link", { name: "국산" }).click();

  // Кликаем по бренду
  await page.getByRole("link", { name: brand, exact: true }).click();
  // Кликаем по модели
  await page.getByRole("link", { name: model, exact: true }).first().click();
  await page.getByRole("link", { name: "연식", exact: true }).click();
  await page
    .locator("#schYear")
    .getByRole("combobox")
    .nth(0)
    .selectOption(min_year);
  await page
    .locator("#schYear")
    .getByRole("combobox")
    .nth(2)
    .selectOption(max_year);
  await page
    .locator("#schYear")
    .getByRole("combobox")
    .nth(3)
    .selectOption(`${currentMonth}`);
  await page.getByRole("link", { name: "주행거리", exact: true }).click();
  await page
    .locator("#schDistance")
    .getByRole("combobox")
    .first()
    .selectOption(min_mileage);
  await page
    .locator("#schDistance")
    .getByRole("combobox")
    .nth(1)
    .selectOption(max_mileage);
  await page.getByRole("link", { name: "연료" }).click();
  await page.locator("#schFuel").getByText(fuel_type, { exact: true }).click();

  // Ждём появления списка поколений
  await page.waitForSelector("#schModelstep dd a");

  const generations = page.locator("#schModelstep dd a");
  const count = await generations.count();

  for (let i = 0; i < count; i++) {
    const [text] = await Promise.all([generations.nth(i).textContent()]);
    // const text = await generations.nth(i).textContent();

    const emLocator = page.locator("#schModelstep dd a + em");
    // Явно ждём появления хотя бы одного <em>

    const amountCarsText = await emLocator.nth(i).textContent();
    const amountCars = Number(amountCarsText?.replace(/[^\d]/g, "") || "0");

    // Проверка: если машин нет — пропускаем
    if (!amountCars || amountCars <= 0) continue;

    // Ищем диапазон годов в названии поколения, например: "그랜저 하이브리드 (GN7)(22년~현재)"
    const matched = text.match(/(\d{2})년(~현재|~\d{2}년)?/);
    if (matched) {
      const startYear = 2000 + parseInt(matched[1]);
      const endYear = matched[2]?.includes("현재")
        ? max_year
        : 2000 +
          parseInt(
            matched[2]?.replace("~", "").replace("년", "") ?? `${startYear}`
          );

      if (startYear <= max_year && endYear >= min_year) {
        console.log(
          `Найдено подходящее поколение для ${brand} ${model}: ${text}`
        );
        await generations.nth(i).click();
      }
    }
  }
});
