import { test, expect } from "@playwright/test";

test("test", async ({ page }) => {
  await page.goto(
    "https://fem.encar.com/cars/detail/38801458?pageid=dc_carsearch&listAdvType=pic&carid=38801458&view_type=hs_ad&wtClick_korList=015&advClickPosition=kor_pic_p1_g2"
  );

  await page.getByRole("button", { name: "자세히", exact: true }).click();
  await page.getByRole("button", { name: "조회수 자세히보기" }).click();
  const text = await page.getByText("최초등록일").textContent();
  console.log(texr);
});
