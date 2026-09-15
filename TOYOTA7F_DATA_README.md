# Toyota 7F 前輪資料核對流程

目前頁面內建的六個零件只用於測試熱點與搜尋，不包含任何正式料號，也不可作為報價依據。

## 匯入測試

1. 複製 `data/toyota7f-frontwheel-parts.template.json`。
2. 每筆只使用 `allowedIds` 內既有的零件 ID；本輪不增加目錄範圍。
3. 從可追溯來源核對資料後，填寫料號、`source` 與 `checkedAt`。
4. 將 `verification.status` 改成 `verified`。
5. 在頁面按「載入已核對資料（JSON）」並選取該檔案。

載入器會拒絕未知或重複 ID、未標記為 `verified`、缺少來源，以及日期格式不是 `YYYY-MM-DD` 的資料。零件名稱與熱點位置由頁面內建資料控制，匯入檔不能覆寫，避免資料檔意外改變已完成的目錄範圍。

## 正式資料要求

- `oem`：Toyota OEM 料號；無資料可留空，不可猜測。
- `aftermarket.jianzhang`、`aftermarket.zefeng`：交叉料號；無資料可留空。
- `sku`：廣臻內部 SKU；無資料可留空。
- `verification.source`：可回查的型錄頁碼、供應商文件名稱或內部核對單號。
- `verification.checkedAt`：實際核對日期。
