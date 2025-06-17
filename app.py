from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from playwright.async_api import async_playwright
from datetime import datetime
from twocaptcha import TwoCaptcha
import re


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

async def extract_first_registration_date(page):
    try:
        await page.get_by_role("button", name="조회수 자세히보기").click()
        text = await page.get_by_text("최초등록일").text_content()

        match = re.search(r"\d{4}/\d{2}/\d{2}", text or "")
        if match:
            date_str = match.group()
            today_str = datetime.now().strftime("%Y/%m/%d")

            if date_str == today_str:
                print("📅 Дата регистрации совпадает:", date_str)
                return date_str
            else:
                print(f"⚠️ Дата регистрации ({date_str}) не совпадает с {today_str}")
                return None
        else:
            print("⚠️ Дата не найдена в тексте.")
            return None
    except Exception as e:
        print("❌ Ошибка при получении даты:", e)
        return None


@app.post("/send_car_info")
async def send_car_info(request: Request):
    body = await request.json()
    result_url = await run_encar_parse(**body)

    if result_url:
        new_car = result_url.split("/")[-1]
        return {"id": new_car}
    return {"id": None}


async def run_encar_parse(
    brand, model, min_year, max_year, max_mileage, fuel_type, drive, color
):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        config = {
            'server':           '2captcha.com',
            'apiKey':           '04146c8b571714ebc59daead1851501e',
            'softId':            123,
            'callback':         'http://www.encar.com/index.do',
            'defaultTimeout':    120,
            'recaptchaTimeout':  600,
            'pollingInterval':   10,
            'extendedResponse':  False
        }
        current_month = datetime.now().month
        incoming_cars = ["BMW", "벤츠", "아우디", "폭스바겐", "포르쉐", "볼보", "랜드로버", "Toyota"]
        TwoCaptcha("04146c8b571714ebc59daead1851501e")
      

        if brand in incoming_cars:
            await page.get_by_role("link", name="수입", exact=True).first.click()
        else:
            await page.goto("http://www.encar.com/dc/dc_carsearchlist.do?carType=kor#!%7B%22action%22%3A%22(And.Hidden.N._.CarType.Y.)%22%2C%22toggle%22%3A%7B%7D%2C%22layer%22%3A%22%22%2C%22sort%22%3A%22ModifiedDate%22%2C%22page%22%3A1%2C%22limit%22%3A20%2C%22searchKey%22%3A%22%22%2C%22loginCheck%22%3Afalse%7D")
            # await page.locator("#gnb").get_by_role("link", name="국산").click()

        await page.get_by_role("link", name=brand, exact=True).first.click()
        await page.get_by_role("link", name=model, exact=True).first.click()
        await page.get_by_role("link", name="연식", exact=True).click()

        year_combos = page.locator("#schYear").get_by_role("combobox")
        await year_combos.nth(0).select_option(str(min_year))
        await year_combos.nth(2).select_option(str(max_year))
        await year_combos.nth(3).select_option(str(current_month))

        await page.get_by_role("link", name="외부색상").click()
        await page.locator("#schColor").get_by_role("link", name="+ 다른 색상 더보기").click()
        await page.locator("#colorSelect").get_by_text(color, exact=True).click()

        await page.get_by_role("link", name="주행거리", exact=True).click()
        mileage_combos = page.locator("#schDistance").get_by_role("combobox")
        await mileage_combos.nth(1).select_option(str(max_mileage))

        await page.get_by_role("link", name="연료").click()
        try:
            fuel = page.locator("#schFuel").get_by_text(fuel_type.strip(), exact=True)
            await fuel.wait_for(timeout=3000)
            await fuel.click()
        except:
            try:
                gas = page.locator("#schFuel").get_by_text("가솔린", exact=True)
                await gas.wait_for(timeout=3000)
                await gas.click()
            except:
                await browser.close()
                raise Exception("Не удалось выбрать топливо")

        generations = page.locator("#schModelstep dd a")
        count = await generations.count()

        for i in range(count):
            text = await generations.nth(i).text_content()
            ems = page.locator("#schModelstep dd a + em")
            amount_text = await ems.nth(i).text_content()
            amount = int(re.sub(r"[^\d]", "", amount_text or "0"))

            if amount <= 0:
                continue

            matched = re.search(r"\(?(\d{2})년(?:~현재|~(\d{2})년)?\)?", text or "")
            if not matched:
                continue

            start_year = 2000 + int(matched.group(1))
            end_year = (
                max_year if "현재" in text else 2000 + int(matched.group(2) or matched.group(1))
            )

            if start_year > int(max_year) or end_year < int(min_year):
                continue

            print(f"📍 Поколение: {brand} {model} — {text}")

            new_page = await context.new_page()
            await new_page.goto(page.url)

            gens = new_page.locator("#schModelstep dd a")
            await gens.nth(i).click()

            await new_page.get_by_text(drive).click()
            await new_page.wait_for_selector("ul#sr_photo.car_list li a.newLink._link")

            cars = new_page.locator("ul#sr_photo.car_list li a.newLink._link")
            car_count = await cars.count()

            for j in range(min(car_count, 10)):
                car_promise = context.wait_for_event("page")
                await cars.nth(j).click()
                car_page = await car_promise

                await car_page.wait_for_load_state()

                try:
                    자세히 = car_page.get_by_role("button", name="자세히", exact=True)
                    if await 자세히.is_visible():
                        await 자세히.click()

                    조회수 = car_page.get_by_role("button", name="조회수 자세히보기")
                    if await 조회수.is_visible():
                        await 조회수.click()

                    reg_date = await extract_first_registration_date(car_page)
                    title = await car_page.title()
                    print(f"📄 Модель {j+1}: {title} — 등록일: {reg_date}")

                    if reg_date:
                        url = car_page.url
                        await browser.close()
                        return url

                except Exception as e:
                    print(f"❌ Ошибка при карточке #{j+1}: {e}")

                await car_page.close()

        await browser.close()
        return None
