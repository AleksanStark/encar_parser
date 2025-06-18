import express from "express";
import { firefox } from "playwright";
import cors from "cors";

const app = express();

app.use(express.json());

app.use(cors());
const port = 3000 || process.env.PORT;

async function extractFirstRegistrationDate(newPage2) {
  try {
    // newPage2.getByText("최초등록일", {
    //   exact: false,
    //   timeout: 1000,
    // });

    await newPage2.getByRole("button", { name: "조회수 자세히보기" }).click();

    const text = await newPage2.getByText("최초등록일").textContent();

    const match = text?.match(/\d{4}\/\d{2}\/\d{2}/);

    if (match?.[0]) {
      const dateStr = match[0]; // например "2025/06/14"

      // Получаем текущую дату в том же формате "YYYY/MM/DD"
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const todayStr = `${year}/${month}/${day}`;

      if (dateStr === todayStr) {
        console.log(
          "📅 Дата регистрации совпадает с сегодняшним днём:",
          dateStr
        );
        return dateStr;
      } else {
        console.log(
          `⚠️ Дата регистрации (${dateStr}) не совпадает с сегодняшним днём (${todayStr}).`
        );
        return null;
      }
    } else {
      console.log("⚠️ Дата не найдена в тексте.");
      return null;
    }
  } catch (err) {
    console.log("❌ Ошибка при получении даты регистрации:", err);
    return null;
  }
}

const runEncarParse = async (
  brand,
  model,
  min_year,
  max_year,
  max_mileage,
  fuel_type,
  drive,
  color
) => {
  const browser = await firefox.launch({
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const currentMonth = new Date().getMonth() + 1;
  const incomingCars = [
    "BMW",
    "벤츠",
    "아우디",
    "폭스바겐",
    "포르쉐",
    "볼보",
    "랜드로버",
    "Toyota",
  ];

  await page.goto("http://www.encar.com/index.do");
  if (incomingCars.includes(brand)) {
    await page.getByRole("link", { name: "수입", exact: true }).first().click();
  } else {
    await page.locator("#gnb").getByRole("link", { name: "국산" }).click();
  }

  // Кликаем по бренду
  await page.getByRole("link", { name: brand, exact: true }).first().click();
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

  await page.getByRole("link", { name: "외부색상" }).click();
  await page
    .locator("#schColor")
    .getByRole("link", { name: "+ 다른 색상 더보기" })
    .click();
  await page.locator("#colorSelect").getByText(color, { exact: true }).click();

  await page.getByRole("link", { name: "주행거리", exact: true }).click();
  //   await page
  //     .locator("#schDistance")
  //     .getByRole("combobox")
  //     .first()
  //     .selectOption(min_mileage);
  await page
    .locator("#schDistance")
    .getByRole("combobox")
    .nth(1)
    .selectOption(max_mileage);
  await page.getByRole("link", { name: "연료" }).click();

  try {
    const fuelLocator = page
      .locator("#schFuel")
      .getByText(fuel_type.trim(), { exact: true });
    await fuelLocator.waitFor({ state: "visible", timeout: 3000 });
    await fuelLocator.click();
    console.log(`✅ Выбрано топливо: ${fuel_type}`);
  } catch (error) {
    console.log(
      `⚠️ Не удалось найти топливо "${fuel_type}", пробуем бензин...`
    );

    // Если не нашли указанное топливо, выбираем бензин
    try {
      const gasolineLocator = page
        .locator("#schFuel")
        .getByText("가솔린", { exact: true });
      await gasolineLocator.waitFor({ state: "visible", timeout: 3000 });
      await gasolineLocator.click();
      console.log("✅ Выбран бензин (가솔린) как fallback");
      return false; // Возвращаем false, так как использовали fallback
    } catch (fallbackError) {
      console.log("❌ Не удалось выбрать даже бензин!");
      throw new Error("Не удалось выбрать ни указанное топливо, ни бензин");
    }
  }
  await page.waitForSelector("#schModelstep dd a");

  const generations = page.locator("#schModelstep dd a");
  const count = await generations.count();

  for (let i = 0; i < count; i++) {
    const text = await generations.nth(i).textContent();
    const emLocator = page.locator("#schModelstep dd a + em");
    const amountCarsText = await emLocator.nth(i).textContent();
    const amountCars = Number(amountCarsText?.replace(/[^\d]/g, "") || "0");

    if (!amountCars || amountCars <= 0) continue;

    const matched = text.match(/\(?(\d{2})년(?:~현재|~(\d{2})년)?\)?/);
    if (!matched) continue;

    const startYear = 2000 + parseInt(matched[1]);

    const endYear = text.includes("현재")
      ? max_year
      : matched[2]
      ? 2000 + parseInt(matched[2])
      : startYear; // если нет ни "현재", ни второго года

    if (startYear > max_year || endYear < min_year) continue;

    console.log(`📍 Поколение: ${brand} ${model} — ${text}`);

    const newPage = await context.newPage();
    await newPage.goto(page.url(), { waitUntil: "domcontentloaded" });

    const newGenerations = newPage.locator("#schModelstep dd a");
    await newGenerations.nth(i).waitFor({ state: "visible" });

    await Promise.all([
      newGenerations.nth(i).click(),
      newPage.getByText(drive).click(),
      newPage.waitForSelector("ul#sr_photo.car_list li a.newLink._link", {
        timeout: 10000,
      }),
    ]);

    // 🎯 Обрабатываем карточки машин
    const carItems = newPage.locator("ul#sr_photo.car_list li a.newLink._link");
    const countModels = await carItems.count();
    const limit = 10;

    for (let j = 0; j < Math.min(countModels, limit); j++) {
      const [carPage] = await Promise.all([
        context.waitForEvent("page"),
        carItems.nth(j).click(),
      ]);

      await carPage.waitForLoadState();

      try {
        const 자세히 = carPage.getByRole("button", {
          name: "자세히",
          exact: true,
        });
        if (await 자세히.isVisible()) await 자세히.click();

        const 조회수 = carPage.getByRole("button", {
          name: "조회수 자세히보기",
        });
        if (await 조회수.isVisible()) await 조회수.click();

        const regDate = await extractFirstRegistrationDate(carPage); // 👈 твоя функция
        const title = await carPage.title();
        console.log(`📄 Модель ${j + 1}: ${title} — 등록일: ${regDate}`);

        if (regDate) {
          const url = carPage.url();
          console.log("✅ Найдена нужная дата, останавливаемся");
          await browser.close();
          return url;
        }
      } catch (err) {
        console.log(`❌ Ошибка при обработке карточки #${j + 1}:`, err);
      }

      await carPage.close();
    }

    await browser.close();
    console.log("Браузер закрыт нвните поиск заново");
  }
};

app.post("/send_car_info", async (req, res) => {
  const {
    brand,
    model,
    min_year,
    max_year,
    max_mileage,
    fuel_type,
    drive,
    color,
  } = req.body;

  const result = await runEncarParse(
    brand,
    model,
    min_year,
    max_year,
    max_mileage,
    fuel_type,
    drive,
    color
  );

  const newCar = result.split("/").pop();

  if (newCar) res.json({ id: newCar });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
